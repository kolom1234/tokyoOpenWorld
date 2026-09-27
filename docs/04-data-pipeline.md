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
| `bridges` | PLATEAU brid | `PlateauReader` | 표면 메시 + 상판 높이 |
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
| 노면 표시 | OSM lanes/turn:lanes + 도로 폴리곤 → 차선(백색 실선/점선, 황색 추월금지), 정지선, 횡단보도(일본식: 측선 없는 사다리형, 폭 0.45 m 줄 간격 0.45 m), 「止まれ」 문자 데칼(자체 폰트 메시) |
| 신호 | OSM `highway=traffic_signals` + PLATEAU frn → 교차로별 신호기 배치(차량용 3색 가로형, 보행자용 2색) + `signalGroups` |
| 소품 절차 배치 | 규칙 기반(시드=hash(cellId,'props')): 전신주(폭원 < 15 m 생활도로에만 30–40 m 간격, 간선도로·무전주화 지구 `data/rules/no-poles.geojson` 제외), 가로등, 자판기(상업·주거 건물 전면, 밀도 파라미터), 자전거 거치대(역 반경 300 m), 버스정류장(OSM), 우체통(OSM `amenity=post_box`), 표지판 |
| 나무 | PLATEAU veg 위치·높이 우선, OSM 보완. 수종 매핑: 가로수 기본 규칙(간선=은행나무/느티나무 가중, 공원=혼합) → `species` |
| 파사드 파라미터 | 건물별: 층수(`storeys` 또는 `measuredHeight/3.2`), 용도→파사드 클래스(office_curtain, office_punched, retail_podium, residential_mansion, house_wood, house_mortar, station, temple…), PLATEAU 텍스처 평균색→틴트, 1층 상점 여부(용도·도로 인접) |
| 레인 그래프 | OSM 도로 중심선 + 차선 수 → 차선 중심 폴리라인, 교차로 연결(좌회전/우회전 곡선), 제한속도, 신호 그룹 참조 |
| 보행 그래프 + 내비메시 | 보도·횡단보도·광장 폴리곤 + 계단/육교(OSM `highway=steps/footway bridge=yes`) → Recast 타일(64 m, 셀당 4×4), 에이전트 반경 0.3 m |
| 철도 | 트랙 폴리라인 → Catmull-Rom 스플라인(0.5 m 샘플), 높이: 지상=지형+0.8 m(도상), 교량=PLATEAU brid 상판, 터널=비렌더. 역 정차 위치(플랫폼 중심) 산출 |
| 오디오 존 | 규칙: 교차로 반경 40 m=crossing, 역 건물·플랫폼=station, 공원=park, 폭 < 6 m 도로 주변=alley, 상점가(OSM `shop=*` 밀집)=shopping |
| 광원 | 가로등·신호·간판·상점 쇼윈도(1층 retail)·자판기 → 점/스포트 광원 목록(색온도, 강도, 점등 시각) |
| POI | Wikidata(좌표·다국어명) + `content/poi/*.yaml`(자체 설명) → 셀 meta의 `pois[]`, 발견 반경 |
| 상호작용 지점 | 카셰어(OSM `amenity=parking` 중 규칙 선택), 공유자전거 독(역 반경 300 m), 개찰구(역 오버라이드 메타), 전망 포인트(`content/poi` 지정) → 셀 meta `interactables[]` |

### 4.4 build (L0 셀 → TKC)
셀마다 섹션 생성 (`05-tile-format.md §4`):
1. 지형 메시: 1 m 그리드 → meshopt simplify(오차 5 cm) + 경계 정점 고정. 높이장 섹션(물리용) 별도.
2. 건물: 머티리얼 클래스별 병합, 정점 속성 `_BLDG`(u16), `_FACADE(u8x4: class, floors, tint idx, flags)`. LOD2 텍스처는 **사용하지 않고** 틴트만 추출(항공사진 기반 텍스처는 그림자가 구워져 있어 동적 조명과 충돌).
3. 도로/보도/노면표시: 메시 + 데칼 메시(깊이 오프셋용 별도 프리미티브).
4. 오버라이드: `content/overrides/<gmlId>/model.glb`가 있으면 해당 건물 대체(원점·스케일 검증).
5. 인스턴스: 소품/나무 → 타입별 트랜스폼 배열(`props.inst`).
6. 충돌: 건물 단순화(meshopt simplify 오차 0.3 m) 삼각 메시, 연석·가드레일, `catalog.json`에서 `collider`가 정의된 소품(박스/캡슐/원기둥), 나무 줄기(원기둥, 반경 = 높이×0.02) → 모두 `collision.bin`.
7. 내비·레인·광원·오디오·POI·meta.
8. glTF 후처리(gltf-transform): `dedup → weld → reorder → quantize → meshopt(encode)`; 텍스처는 셀에 넣지 않고 `shared/materials` 참조(머티리얼 ID).

### 4.5 hlod
| 레벨 | 셀 크기 | 내용 | 목표 크기 |
|---|---|---|---|
| L1 | 1024 m | L0 16개 병합 → 건물 simplify 25%, 소품 제거, 나무→임포스터 카드, 지형 4 m | ≤ 3 MB |
| L2 | 4096 m | 건물 = LOD1 박스(높이 유지, 틴트), 지형 16 m, 지면 색 = 항공사진 저주파 | ≤ 2 MB |
| L3 | 16384 m | 블록 단위 압출 매스, 지형 64 m | ≤ 2 MB |
- MVP 영역 밖 23구: `plateau-tokyo23` LOD1로 L2/L3만 생성. `hlodExtentWF`는 L3(16384 m) 격자에 정렬(3×3 L3 셀이 23구 전체를 덮음).
- 야간용: L1–L3 건물에 창 발광 마스크 파라미터 포함(원거리 야경).

### 4.6 validate (실패 시 publish 차단)
- 스키마 검증(world.json, 셀 헤더, meta).
- 예산: L0 셀 ≤ 4 MB(압축), 렌더 삼각형 ≤ 400k, 콜라이더 삼각형 ≤ 60k, 인스턴스 ≤ 5k.
- 경계 이음새: 이웃 셀 지형 가장자리 높이 차 = 0 (정확 일치).
- 정확도 샘플: 랜드마크 20곳 높이(measuredHeight vs 메시 bbox) 오차 ≤ max(2 m, 5%).
- 라이선스: 모든 섹션의 `sources[]`가 lock에 존재.
- 보고서: `data/build/<buildId>/report.html` (셀별 크기 히트맵, 경고 목록).

### 4.7 publish
1. S3 호환 API로 `world/<buildId>/**` 업로드 (Content-Type: `application/octet-stream`/`application/json`/`image/ktx2`, 멀티파트, 동시성 16).
2. 업로드 완료 검증(개수·크기) 후 KV `CURRENT_BUILD:v<formatVersion> = <buildId>` 설정 → 클라이언트는 다음 세션부터 새 빌드.
3. 이전 빌드는 7일 유지 후 `pnpm pipeline gc`로 삭제(현재+직전 1개는 항상 유지).

## 5. 성능 목표(파이프라인)
MVP 영역 전체 `all` ≤ 90분(8코어), 셀 1개 증분 빌드 ≤ 30초.

## 6. 경계 규칙 (셀 이음새 불변식)
- 지형: 셀 경계 정점은 256 m 경계선 위 1 m 간격으로 고정, simplify 시 잠금.
- 건물: 중심점 소속 셀에만 포함(경계를 넘어도 분할 안 함) → 스트리밍 시 이웃 셀과 bbox 겹침 허용(최대 256 m까지 확장된 셀 AABB를 헤더에 기록).
- 도로/보도/노면표시: 경계에서 클리핑, 동일 정점 공유.
- 레인/보행 그래프: 경계 넘는 엣지는 양쪽에 "포털 노드"(`cellId:nodeId` 전역 키)로 기록 → 런타임에서 연결.
- 절차 소품: 위치 기준으로 소속 셀 결정 → 중복 없음.
