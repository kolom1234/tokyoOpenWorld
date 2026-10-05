# 04 — Data Pipeline (`tools/pipeline`)

## 1. 목표와 원칙
- **재현성**: `data/sources.lock.json` + 파이프라인 코드 버전 → 동일 입력이면 바이트 동일 산출(결정론적 시드, 정렬된 출력).
- **셀 독립성**: L0 셀 단위로 병렬·증분 빌드. 한 셀 재빌드가 이웃 셀을 깨지 않도록 경계 규칙 고정(§6).
- **데이터 우선순위**: PLATEAU(형상·높이) > GSI(지형) > OSM(속성·세부) > 절차 생성(데이터 공백 채움).
- 실행 환경: `tools/pipeline/Dockerfile` (Node 24 + GDAL + osmium + toktx + nusamai 고정 버전). 로컬 16 GB RAM 이상 권장.

## 2. CLI
```
pnpm pipeline <stage> --area <areaId> [--cells L0_-1_0,L0_0_0] [--jobs 8] [--force]
stage: fetch | normalize | derive | build | hlod | validate | publish | all
```
- 영역 정의: `data/areas/<areaId>.json` (schema `schemas/area.schema.json`)
```json
{ "id": "mvp-shibuya-shinjuku", "l0": { "minIx": -7, "maxIx": 6, "minIz": -17, "maxIz": 3 },
  "hlodSources": ["plateau-tokyo23"], "hlodExtentWF": { "minX": -16384, "maxX": 32768, "minZ": -32768, "maxZ": 16384 } }
```
  (`maxIx/maxIz` 포함 범위. 14×21 = 294 셀)
- 증분: 각 셀 산출물은 `hash(입력 버킷 해시들, stage 코드 버전 상수, 설정)`을 키로 `data/build/.cache/`에 저장. 동일하면 스킵.
- buildId: `YYYYMMDD-<gitShort7>-<lockHash8>`.

## 3. 디렉토리 흐름
```
data/raw/<sourceId>/...                      (fetch)
data/normalized/<layer>/<cellId>.ndjson.gz   (normalize: WF 좌표, 셀 버킷)
data/normalized/terrain/dem_1m.{tif,json}    (PRJ, 1 m 그리드: 픽셀 중심 = 정수 m, + 메타·결측 통계)
data/derived/<layer>/<cellId>.*              (derive)
data/build/<buildId>/                        (build/hlod/validate)
   world.json   cells.idx   L0/<ix>/<iz>.tkc   L1/..  L2/..  L3/..
   shared/materials/*.ktx2  shared/props/*.glb  shared/characters/*.glb
   odbl/osm-derived.gpkg    credits.json
```

## 4. Stage 상세

### 4.1 fetch
- lock 파일의 각 소스를 다운로드 → sha256 검증 → `data/raw/<id>/extracted/` 압축 해제(원본 zip은 `data/raw/<id>/`에 보존).
- OSM: Geofabrik PBF → `osmium extract --bbox <영역 bbox + 500 m>` 로 축소.

### 4.2 normalize (소스별 리더 → 공통 레코드)
공통 규칙: 모든 좌표를 WF로 변환(`@sanpo/geo` 사용, PLATEAU EPSG:6697 → 6677 → WF). 피처는 **중심점이 속한 L0 셀**에 버킷팅(건물은 분할하지 않음). 선/면 레이어(도로, 지형)는 셀 경계에서 클리핑.

| 레이어 | 입력 | 리더 | 출력 레코드 핵심 필드 |
|---|---|---|---|
| `buildings` | PLATEAU bldg (LOD3 > LOD2 > LOD1) | `PlateauReader` | `gmlId, buildingId, lod, measuredHeightM, storeys, storeysBelow, usage(코드), surfaces[{kind: roof/wall/ground/closure/installation, gmlId?, ringsWF, uv?, tex?}], source` |
| `roads` | PLATEAU tran (도로별 LOD3 TrafficArea > LOD2 > LOD1 Road면) | `PlateauReader` | `id, roadId, lod, function(carriageway/sidewalk/island/crosswalk/other), functionCode, polygonWF, source` |
| `bridges` | PLATEAU brid(`udx/brid/*_op.gml`) | `PlateauReader` | `BridgeRecord` = buildings와 같은 모양(`layer: 'bridges'`): surfaces[{kind: roof = OuterFloor·Roof(상판 윗면), ground = OuterCeiling·Ground, wall, installation = BridgeConstructionElement·BridgeInstallation}] — M05-T08, ADR-0056. `normalize --layer plateau --plateau-layer brid`로 교량만 |
| `furniture` | PLATEAU frn LOD3 | `PlateauReader` | `class(pole/sign/signal/lamp/...), transform, dims` |
| `vegetation` | PLATEAU veg LOD3 (SolitaryVegetationObject), OSM `natural=tree` | `PlateauReader`, `OsmReader` | `species?, height, crown, posWF` |
| `terrain` | GSI DEM1A(1 m, 주) → 결측만 DEM5A(5 m) → 잔여 결측 역거리 보간 | `readers/dem.ts` + GDAL | `dem_1m.tif`(EPSG:6677, 1A bilinear·5A bicubic 재표본, 픽셀 중심 = 정수 PRJ = 정수 WF) |
| `osm` | OSM PBF | `OsmReader` (osmium export → GeoJSONSeq) | 도로 중심선(lanes, oneway, maxspeed, width, layer, bridge, tunnel), 신호·횡단보도 노드, 철도(railway=*, service, electrified), 플랫폼, landuse/leisure, 이름 |
| `rail` | KSJ N02 + OSM railway | `RailReader` | 노선ID, 운영사, 트랙 폴리라인(선로별), 역·플랫폼 |
| `areas` | e-Stat 소지역 | `BoundaryReader` | 町丁目 폴리곤 + 이름(ja, 로마자) |

**PlateauReader 구현**: 자체 스트리밍 CityGML 파서(SAX, `saxes`) 채택 — ADR-0007(nusamai는 면 종류·도로 기능·UV를 병합해 잃음). 인터페이스 `PlateauReader.read(file): AsyncIterable<NormalizedFeature>` 고정 → 구현 교체 가능(`--reader nusamai`는 비교용).
좌표는 1 mm 반올림, 셀 파일 안은 id 정렬, gzip 헤더 고정(mtime 0, OS 255) → 바이트 동일. 입력 파일은 대상 셀을 덮는 3차 메시(`jisMesh3CodesInBBox`)로 고른다.

### 4.3 derive (데이터 공백 채움 + 게임 레이어 생성)
| 산출 | 방법 |
|---|---|
| 지형 성형 | 건물 footprint 아래 = 건물 최저 지반고로 평탄화. 차도 폴리곤 = 횡단경사 2% 포장면. 보도 = 차도 + 0.15 m(연석). 공원 = 원 DEM 유지 |
| 연석/가드레일 | 보도–차도 경계 폴리라인 → 연석 메시(높이 0.15 m, 모따기) + 콜라이더. 가드레일은 OSM `barrier=guard_rail` + 규칙(간선도로 보도 측) |
| ↳ 구현(M05-T01, ADR-0049) | `stages/derive/{terrain-shape,edge-burn,roads,curbs,sidewalks,footprints,grid}.ts` + `build/roads-mesh.ts`: 셀 + 여유 16 m 창 국소 성형(차도 D + 2 % 경사 ≤ 0.15, 보행 바깥 띠 S = D + 0.15·안쪽 D, 비도로 1.5 m → 4 m 섞기, 건물 평탄화 조건부), 차도 = 지형, 보도·교통섬 = `roads.mesh`(4 m 조각 윗면 + 연석 세로 면 + 바깥 치마), 가장자리 새기기 + 지형 맞춤, 보도 윗면 TERRAIN triMesh. 수락 검사 = validate `road gaps`(교차로 50곳 < 2 cm) |
| 노면 표시 | OSM lanes/turn:lanes + 도로 폴리곤 → 차선(백색 실선/점선, 황색 추월금지), 정지선, 횡단보도(일본식: 측선 없는 사다리형, 폭 0.45 m 줄 간격 0.45 m), 「止まれ」 문자 데칼(자체 폰트 메시) |
| ↳ 노면 표시 구현(M05-T02, ADR-0050) | `stages/normalize-osm.ts`(osmium extract·tags-filter·GeoJSONSeq → data/normalized/osm) + `derive/markings/{common,crosswalk,lanes,stopline,text,index}.ts` → `build/decals-mesh.ts`(decals.mesh). 횡단 = OSM crossing 선 + 차도 구간, 차선 = OSM lanes + PLATEAU 차도 폭 행진, 정지선 = 신호 횡단 상류·stop 점, 「止まれ」 자체 획 폰트. 검증 = `checks/markings-photo.ts`(GSI 사진 대조, 검증 전용) |
| ↳ PLATEAU 横断歩道 우선(M06 사전 2, ADR-0058) | `readers/plateau/frn-markings.ts`(frn LOD3 道路標示 1xxx) → data/normalized/markings → `derive/markings/plateau.ts`: PLATEAU 横断歩道(줄무늬형 = 삼각형 그대로, 영역형 = 0.45 m 막대 채우기)·停止線이 덮는 OSM 횡단·정지선은 대체. PLATEAU 없는 곳 = OSM + `content/markings/osm-crossing-corrections.json`(GSI 사진 대조 보정, OSM 원본 불변) |
| 신호 | OSM `highway=traffic_signals` + PLATEAU frn → 교차로별 신호기 배치(차량용 3색 가로형, 보행자용 2색) + `signalGroups` |
| ↳ 현시 코드(M06-T02, ADR-0062) | `derive/props/signal-sites.ts`: 1020 묶음 = 교차로(ID 해시), OSM 차도 선(셀 + 8-이웃 `vehicleRoadsAround`) 각도 봉우리 2개 = 그룹 A·B, `content/sim/signal-plans.json` sites = 계획 → 신호 기둥 `props.inst` 5번째 칸 |
| 소품 절차 배치 | 규칙 기반(시드=hash(cellId,'props')): 전신주(폭원 < 15 m 생활도로에만 30–40 m 간격, 간선도로·무전주화 지구 `data/rules/no-poles.geojson` 제외), 가로등, 자판기(상업·주거 건물 전면, 밀도 파라미터), 자전거 거치대(역 반경 300 m), 버스정류장(OSM), 우체통(OSM `amenity=post_box`), 표지판 |
| ↳ 소품 구현(M05-T03, ADR-0051) | `stages/derive/props/{context,signals,poles,points,vending,linear,wires,index}.ts` + `build/props-cell.ts` → `props.inst` + 소품 콜라이더(`collision.bin` 프리미티브) + 전선(`decals.mesh` `power_wire`). 우선순위 = 신호(교차로 건너편 왼쪽) → 전신주·전선(선 id 시드 정거장) → OSM 점 → 자판기(가상 브랜드) → 가드 파이프(간선) → 맨홀, 셀 예산 5k(`content/props/catalog.json`). ⚠️ PLATEAU frn·무전주화 지구 미사용 |
| 나무 | PLATEAU veg 위치·높이 우선, OSM 보완. 수종 매핑: 가로수 기본 규칙(간선=은행나무/느티나무 가중, 공원=혼합) → `species` |
| ↳ 나무 구현(M05-T04, ADR-0052) | `stages/derive/{vegetation,trees/*}.ts`: OSM 녹지 면 → `_SURF` 잔디, OSM 나무 점·열 → 규칙 가로수(간선 보도) → 녹지 격자 채우기(숲 6.5 m), 수종 = 태그·도로 이름·해시 가중, 줄기 원기둥 콜라이더, 셀 4k → `trees.inst`. 수종 에셋 = `pnpm pipeline trees`(ez-tree + 자체 잎 아틀라스 + CPU 임포스터 → `apps/game/src/assets/trees/`). ⚠️ PLATEAU veg 미사용 |
| 파사드 파라미터 | 건물별: 층수(`storeys` 또는 `measuredHeight/3.2`), 용도→파사드 클래스(office_curtain, office_punched, retail_podium, residential_mansion, house_wood, house_mortar, station, temple…), PLATEAU 텍스처 평균색→틴트, 1층 상점 여부(용도·도로 인접) |
| 레인 그래프 | OSM 도로 중심선 + 차선 수 → 차선 중심 폴리라인, 교차로 연결(좌회전/우회전 곡선), 제한속도, 신호 그룹 참조 |
| ↳ 교량 계단 구현(M05-T08, ADR-0056) | `stages/derive/stairs.ts`: PLATEAU 상판(평평한 roof 면) + OSM `highway=steps`(지상) 중 한 끝 이상이 상판 2 m 안 → 계단 명세(높이 차 0.5–10 m·경사 ≤ 45°, 아래 → 위, 상판에 들어가는 곳에서 자름, 착지판). 두 끝 모두 지형인 계단은 지형 그대로. `footway bridge=yes` 단독 육교는 ⚠️ 미구현(MVP는 PLATEAU brid) |
| 보행 그래프 + 내비메시 | 보도·횡단보도·광장 폴리곤 + 계단/육교(OSM `highway=steps/footway bridge=yes`) → Recast 타일(64 m, 셀당 4×4), 에이전트 반경 0.3 m |
| ↳ 내비메시 구현(M06-T03, ADR-0063) | `stages/derive/{navmesh,nav/surface,nav/raster,nav/recast-tile}.ts` + `build/nav-cell.ts`: 0.5 m 표본 분류(보도 1·생활도로 2·횡단 띠(끝 +1.5 m) 3·OSM 보행로·광장·공원 4, 건물·소품·줄기 없음, 간선 차도 없음) → Recast 64 m 타일 16개(복셀 0.2 × 0.05 m, 반경 0.3·키 1.8·오름 0.25 m, WF 좌표) + 횡단 기록(끝점·반폭·보행 신호 코드 = 소품 신호기와 같은 규칙, 일직선 조각 합침) → `nav.bin`(gzip). 교량 상판·육교는 ⚠️ 미포함 |
| ↳ 레인 그래프 구현(M06-T05, ADR-0065) | `stages/derive/{lanes,lanes/graph,lanes/geometry}.ts` + `build/lanes-cell.ts`: 영역 OSM 간선(trunk–tertiary + _link) 좌표 키 위상 → 방향별 차선(좌측통행 왼쪽 절반, 차로 0 = 연석, 3.0 m) → 교차점 정지선 물림·베지어 연결로(좌 = 연석 차로·우 = 안쪽, 유턴 없음)·정지선 신호 코드 → 셀로 잘라 포털 노드 → `lanes.bin` v2(gzip). 횡단 띠 병합(`build/nav-cell.ts mergeCollinear`)은 6 m 미만 끝 조각을 반폭 차·25°까지 본 띠에 흡수(M06-T07, ADR-0067). 점 간격 ≤ 4 m로 나눠 점마다 지면 높이(M06-T06 — 긴 직선에서 차가 ±0.4–0.7 m 뜨고 묻혔다 → ±0.02 m) |
| 철도 | 트랙 폴리라인 → Catmull-Rom 스플라인(0.5 m 샘플), 높이: 지상=지형+0.8 m(도상), 교량=PLATEAU brid 상판, 터널=비렌더. 역 정차 위치(플랫폼 중심) 산출 |
| ↳ 철도 구현(M07-T01, ADR-0070) | `fetch --source ksj-n02` → `normalize --layer rail`(OSM railway·승강장·역 → data/normalized/rail/osm-rail.ndjson.gz, 영역 + 1.5 km) → `build`가 먼저 `build/rail-global.ts`: 노선 목록 `content/sim/rail-lines.json`(OSM 선로 name) → `derive/rail/{tracks,splines,speed-limits,platforms}.ts`(끝점 사슬·좌측통행 방향, 구심 Catmull-Rom 0.5 m, 레일 윗면 = 지형 + 0.5 m — 교량·터널 구간은 양끝 지상 보간 + ±20 m 평활, √(0.8 R) 곡률 제한, 승강장 겹침 가운데 정차·문 쪽) → `global/rail.bin`(05 §9) + `rail-report.json`(N02 대조), 셀 overrides.mesh에 도상·침목·레일·가선주·전차선(`build/overrides/rail.ts` — 터널 제외, 교량 상판). 수락 검사 `checks/rail-photo.ts`(항공사진 거울 대칭 중심) |
| ↳ 시간표(M07-T02, ADR-0071) | rail.bin 직후 `stages/timetables/`: 합성(`content/sim/synthetic-lines.json` — JR 계통·선로 위상·시간대 간격·역 정차, 같은 선로 계통 합쳐 120 s 밀기) + GTFS(`rail-lines.json` `gtfs` — 긴자선, `fetch --source odpt-tokyometro`, 키 = `ODPT_CONSUMER_KEY` 환경 변수, 없으면 'waiting-key') → core `tripLegs` 곡선으로 정차 시각 → 스키마 검증 → `global/timetables/<line>.json` + `index.json` + `timetable-report.json`. 단독 재실행 `timetables --build-id <id> [--gtfs <line>=<dir\|zip>]` |
| 오디오 존 | 규칙: 교차로 반경 40 m=crossing, 역 건물·플랫폼=station, 공원=park, 폭 < 6 m 도로 주변=alley, 상점가(OSM `shop=*` 밀집)=shopping |
| 광원 | 가로등·신호·간판·상점 쇼윈도(1층 retail)·자판기 → 점/스포트 광원 목록(색온도, 강도, 점등 시각) |
| POI | Wikidata(좌표·다국어명) + `content/poi/*.yaml`(자체 설명) → 셀 meta의 `pois[]`, 발견 반경 |
| 상호작용 지점 | 카셰어(OSM `amenity=parking` 중 규칙 선택), 공유자전거 독(역 반경 300 m), 개찰구(역 오버라이드 메타), 전망 포인트(`content/poi` 지정) → 셀 meta `interactables[]` |

### 4.4 build (L0 셀 → TKC)
셀마다 섹션 생성 (`05-tile-format.md §4`):
1. 지형 메시: 1 m 그리드 → RTIN 단순화(모든 샘플 수직 오차 ≤ 5 cm, 정확 측정) + 경계 정점 고정(ADR-0018). 높이장 섹션(물리용) 별도(모든 셀 공통 기준·스텝).
2. 건물: 머티리얼 클래스별 병합, 정점 속성 `_BLDG`(u16), `_FACADE(u8x4: class, floors, tint idx, flags)` — `stages/build/facade-params.ts`(용도·높이 → 클래스·상점·커튼월, ADR-0030), 벽 평면 묶기(`wall-planes.ts`)·TEXCOORD_1(면 폭·건물 높이). LOD2 텍스처는 **사용하지 않고** 틴트만 추출(항공사진 기반 텍스처는 그림자가 구워져 있어 동적 조명과 충돌).
3. 도로/보도/노면표시: 메시 + 데칼 메시(깊이 오프셋용 별도 프리미티브).
4. 오버라이드(M05-T05, ADR-0053): `content/overrides/<id>/meta.json` — 대체 건물(`replace`)의 PLATEAU 면을 높이 띠·규칙별 랜드마크 머티리얼로 다시 내는 셸 + 절차 부품(상자·원기둥·압출·난간·참도 띠·벽 화면·도리이·동상) → `overrides.mesh`(`_LMAT`). 대체 건물은 buildings.mesh 렌더에서만 빠진다(충돌·meta 유지). 검사: 셸 + 붙은 부품 경계 vs PLATEAU 수평 ≤ 0.5 m·높이 ≤ 1 m(넘으면 빌드 실패). 수작업 glb는 쓰지 않는다. 같은 스트림에 대체 안 한 건물마다 옥상 설비(塔屋·물탱크·실외기·난간·안테나)·소형 건물 외부 비상계단(M05-T07, ADR-0055). 교량 면(PLATEAU brid, 계단 통로 안 면 걷어내기·위 끝 난간 자르기)·높이 계단(챌면 ≤ 0.20 m + 옆 판·손스침·착지판)도 같은 스트림(M05-T08, ADR-0056).
5. 인스턴스: 소품/나무 → 타입별 트랜스폼 배열(`props.inst`, 카탈로그가 있을 때만 — `buildArea({ props })`).
6. 충돌(`stages/build/collision.ts`, ADR-0042): 건물 렌더 면 1 mm 용접 → 단순화(meshopt simplify 절대 오차 0.3 m) → 64 m 블록 순 ≤ 2500 삼각형 청크(JCOL triMesh 여러 개), 교량 면(단순화 없이 지면 스트림)·계단 램프 프록시(flags bit0)·계단 옆 벽 박스(M05-T08), 연석·가드레일, `catalog.json`에서 `collider`가 정의된 소품(박스/캡슐/원기둥), 나무 줄기(원기둥, 반경 = 높이×0.02) → 모두 `collision.bin`.
7. 내비·레인·광원·오디오·POI·meta.
8. glTF 후처리: `reorder(meshopt) → quantize(직접) → meshopt(encode, gltf-transform core+extensions)` — dedup·weld는 필요 시 추가(ADR-0018); 텍스처는 셀에 넣지 않고 `shared/materials` 참조(머티리얼 ID).

### 4.5 hlod
| 레벨 | 셀 크기 | 내용 | 목표 크기 |
|---|---|---|---|
| L1 | 1024 m | L0 16개 병합 → 건물 simplify 25%(건물 단위 용접, 절대 오차 ≤ 2 m), 소품 제거, 나무→임포스터 카드(M04), 지형 4 m(dem_1m, RTIN 0.25 m) | ≤ 3 MB |
| L2 | 4096 m | 건물 = LOD1 박스(방향 사각형 OBB, 높이 유지 — 높이 ≥ 20 m·바닥 ≥ 1000 m² 부피 순 ≤ 12k동) + 나머지 64 m 블록 매스, 지형 16 m(RTIN 1 m), 지면 색 = 항공사진 저주파(M03) | ≤ 2 MB |
| L3 | 16384 m | 128 m 블록 압출 매스(면적 가중 높이) + 높이 ≥ 80 m 개별 박스, 지형 64 m(RTIN 4 m) | ≤ 2 MB |
- 명령: `hlod-prep`(원천 → data/derived: `--step buildings` 23구 zip 스트림 → `far-buildings/L2_*.ndjson.gz`, `--step dem` 標高タイル → `terrain-far/dem_far.{json,f32}` 8 m) → `hlod --build-id <id>`(build 결과에 L1–L3 추가, cells.idx 병합).
- L1 = 영역 L0의 부모. 영역 밖 자식은 23구 원경 박스 + 원경 DEM. L2/L3 = `hlodExtentWF` 전체(`plateau-tokyo23` LOD1, 23구 밖은 지형만). `hlodExtentWF`는 L3(16384 m) 격자에 정렬(3×3 L3 셀이 23구 전체를 덮음).
- 자식 분할: 건물 = 중심점(normalize와 같은 `centroidXZ`)의 자식, 지형 = 자식 정사각형별 65² RTIN 패치 + 네 변 스커트(깊이 = 격자 간격). 자식 번호는 정점 속성 `_CHILD`(머티리얼별 프리미티브 1개). 예산 초과 시 단순화 강화 재시도(ADR-0024).
- 야간용: L1–L3 건물 `_FACADE.flags` = 점등 단계(하위 4비트, 용도별) + 창 패턴 시드(상위 4비트)(원거리 야경, 05 §4).

### 4.6 validate (실패 시 publish 차단)
- 스키마 검증(world.json, 셀 헤더, meta).
- 예산: L0 셀 ≤ 4 MB(압축), 렌더 삼각형 ≤ 400k, 콜라이더 삼각형 ≤ 60k, 인스턴스 ≤ 5k.
- 경계 이음새: 이웃 셀 지형 가장자리 높이 차 = 0 (정확 일치).
- 정확도 샘플: 랜드마크 20곳 높이(measuredHeight vs 메시 bbox) 오차 ≤ max(2 m, 5%).
- 라이선스: 모든 섹션의 `sources[]`가 lock에 존재.
- 도로 간극(`road gaps`, M05-T01): 교차로 50곳 보도 가장자리·연석 vs 지형 < 2 cm.
- 시간표(`timetables`, ADR-0071): rail.bin이 있으면 index·노선 파일 스키마, 같은 선로 이웃 트립 간격 ≥ 90 s, 운행일(04:00–28:00) 안 = 오류.
- 소품 차도(`props on road`, ADR-0068): L0 지상 소품이 PLATEAU 차도 폴리곤 위(보도 없는 길가 ≤ 1 m 예외)·보도 위 길가 기둥이 연석 < 0.3 m = 오류. MVP 전체 0건 유지.
- 보고서: `data/build/<buildId>/report.html` (셀별 크기 히트맵, 경고 목록).

### 4.7 publish
1. `world/<buildId>/**` 업로드(world.json·cells.idx·L0–L3 .tkc, Content-Type `application/json`/`application/octet-stream`, 동시성 16, 재시도 3회) + `manifest.json`(경로·크기·sha256).
   업로더: R2 S3 키가 있으면 S3 호환(SigV4, > 64 MiB 멀티파트), 없으면 Cloudflare API 토큰으로 R2 REST(ADR-0026).
2. 검증(S3 HEAD 또는 `--verify-url` Worker HEAD, 전 파일 크기) 후 KV `BUILDS:v<fv>`·`BUILD_FILES:<id>` 기록, `--set-current`면 `CURRENT_BUILD:v<formatVersion> = <buildId>` → 클라이언트는 다음 세션부터 새 빌드.
3. 이전 빌드는 7일 유지 후 `pnpm pipeline gc --apply`로 삭제(현재 + 직전 1개 = 현재보다 먼저 퍼블리시된 것 중 가장 최근은 항상 유지).

## 5. 성능 목표(파이프라인)
MVP 영역 전체 `all` ≤ 90분(8코어), 셀 1개 증분 빌드 ≤ 30초.

## 6. 경계 규칙 (셀 이음새 불변식)
- 지형: 셀 경계 정점은 256 m 경계선 위 1 m 간격으로 고정, simplify 시 잠금.
- 건물: 중심점 소속 셀에만 포함(경계를 넘어도 분할 안 함) → 스트리밍 시 이웃 셀과 bbox 겹침 허용(최대 256 m까지 확장된 셀 AABB를 헤더에 기록).
- 도로/보도/노면표시: 경계에서 클리핑, 동일 정점 공유.
- 레인/보행 그래프: 경계 넘는 엣지는 양쪽에 "포털 노드"(`cellId:nodeId` 전역 키)로 기록 → 런타임에서 연결.
- 절차 소품: 위치 기준으로 소속 셀 결정 → 중복 없음.
