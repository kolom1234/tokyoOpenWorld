# 05 — World Data Format (TKC v1 & 전역 파일)

> 파이프라인(쓰기)과 런타임(읽기)의 유일한 계약. 구현은 `@sanpo/tile-format` 한 곳에만 존재한다.
> 모든 정수/실수는 **리틀엔디언**. 모든 섹션 시작은 **16바이트 정렬**.

## 1. 퍼블리시 레이아웃 (R2 `world/<buildId>/`)
```
world.json                    월드 매니페스트 (schemas/world.schema.json)
cells.idx                     존재하는 셀 인덱스 (바이너리, §5)
L0/<ix>/<iz>.tkc              상세 셀 (256 m)
L1/<ix>/<iz>.tkc … L3/…       HLOD 셀
shared/materials/manifest.json + *.ktx2    머티리얼 라이브러리 (텍스처 배열 레이어 정의)
shared/props/<typeId>.glb     소품 프로토타입 (LOD0/1/2 포함)
shared/trees/<species>.glb    나무 프로토타입 + 임포스터 아틀라스
shared/characters/*.glb       보행자 베이스 메시 + VAT 텍스처
shared/vehicles/*.glb         차량 (교통/플레이어)
global/rail.bin               전 노선 선로 스플라인·역·정차위치
global/timetables/<lineId>.json  컴파일된 운행표 (GTFS 또는 합성)
global/poi-index.json         전체 POI 목록 (지도·도감)
global/map.pmtiles            2D 지도 벡터 타일 (미니맵/전체지도)
odbl/osm-derived.gpkg         ODbL 공개용 파생 DB
credits.json                  출처 표기
```

## 2. `world.json` (요약)
```json
{
  "schema": 1, "formatVersion": 1, "buildId": "20261101-a1b2c3d-9f8e7d6c",
  "crs": { "projected": "EPSG:6677", "E0": -12000.0, "N0": -37760.0, "heightDatum": "TP" },
  "cellSize": 256, "levels": [256, 1024, 4096, 16384],
  "areas": [{ "id": "mvp-shibuya-shinjuku", "l0": { "minIx": -7, "maxIx": 6, "minIz": -17, "maxIz": 3 } }],
  "spawn": { "posWF": [-22.3, 0, 8.6], "yawDeg": 0 },
  "files": { "cellsIndex": "cells.idx", "materials": "shared/materials/manifest.json", "rail": "global/rail.bin", "map": "global/map.pmtiles" },
  "createdAt": "2026-11-01T00:00:00Z"
}
```

## 3. TKC 컨테이너 구조
| 오프셋 | 타입 | 필드 |
|---|---|---|
| 0 | u8[4] | magic `"TKC1"` (0x54 0x4B 0x43 0x31) |
| 4 | u16 | formatVersion = 1 |
| 6 | u16 | flags — v1은 **항상 0**(bit0 "헤더 JSON gzip"은 예약만. reader는 0이 아니면 `flags` 오류, ADR-0017) |
| 8 | u32 | headerByteLength = N (패딩 제외 JSON 바이트 수) |
| 12 | u32 | reserved = 0 |
| 16 | u8[N] | 헤더 JSON (UTF-8), 이후 0 패딩으로 16바이트 정렬 |
| … | … | 섹션 데이터 (각 16바이트 정렬, 오프셋은 파일 시작 기준 절대값) |

헤더 JSON (`schemas/cell-header.schema.json`):
```json
{
  "cell": { "level": 0, "ix": -1, "iz": 0 },
  "buildId": "…",
  "originWF": [-256, 0, 0],
  "aabbWF": { "min": [-300, 18.2, -40], "max": [30, 231.0, 296] },
  "sections": [
    { "type": "terrain.mesh", "offset": 1024, "length": 181233, "codec": "glb", "sources": ["gsi-dem"], "hash": "xxh64:…" }
  ],
  "materials": ["asphalt_old", "sidewalk_tile_gray"],
  "stats": { "tris": 312000, "colliderTris": 41000, "instances": 3200 }
}
```
- `originWF` = `(ix*size, 0, iz*size)`. 섹션 내 위치는 **셀 로컬**(`WF − originWF`) float32 → 정밀도 확보.
- `aabbWF`는 경계를 넘는 건물을 포함한 확장 AABB (컬링·우선순위에 사용).

### 3.1 결정론·검사 규칙 (ADR-0017)
- **writer**: 헤더 JSON은 위 예시의 고정 키 순서(스키마 밖 필드 없음), `sections`는 `type` 사전순(UTF-16 코드 유닛), `sources`는 정렬·중복 제거, `codec`은 §4 레지스트리 값. 첫 섹션은 `16 + pad16(N)`, 이후 `pad16(이전 끝)`에 배치(0 패딩). 파일은 마지막 섹션 끝에서 끝난다(꼬리 패딩 없음). 헤더 길이 ↔ 오프셋은 고정점 반복으로 결정. 같은 입력 → 같은 바이트.
- **hash**: `"xxh64:" + XXH64(seed 0)` 16자리 소문자 hex(정규 big-endian 표기), 대상 = 파일에 저장된 섹션 바이트(압축 후). 로드 시 검사는 선택(`verifyTkc`, 파이프라인 validate·테스트).
- **reader** 거부 조건 → 오류 코드: 길이 < 16 또는 헤더가 파일 밖 `truncated` · 매직 `magic` · `formatVersion ≠ 1` `version` · flags ≠ 0 `flags` · UTF-8/JSON/구조 오류, 등록 타입의 코덱 불일치·중복 `header` · 오프셋 %16 ≠ 0 `align` · 헤더와 겹침, 파일 밖, 섹션끼리 겹침 `range`. `reserved`와 마지막 섹션 뒤 여분 바이트는 무시.
- **미지 섹션**: 레지스트리에 없는 `type`은 코덱 검사·색인 없이 무시(범위·정렬 검사는 적용). 추가 헤더 필드도 무시.

## 4. 섹션 레지스트리 (새 섹션은 여기 등록 후 사용)
| type | codec | 내용 | 소비자 | 레벨 |
|---|---|---|---|---|
| `terrain.mesh` | glb | 지면 메시. 속성: POSITION, NORMAL, `_SURF`(u8: 0 asphalt,1 sidewalk,2 grass,3 soil,4 gravel,5 water,6 rail_ballast,7 plaza) | render | L0–L3 |
| `terrain.height` | bin+gzip | `{u16 size=257, f32 minH, f32 step=0.01}` + `u16[size*size]` (h = minH + v*step), **minH = 모든 셀 공통 −100**(ADR-0018, 이웃 경계 u16 비트 일치), 1 m 간격, 행 우선 `[iz*size + ix]`(iz=0 북쪽 가장자리, ix=0 서쪽) | physics, 지면 질의 | L0 |
| `buildings.mesh` | glb | 파사드 클래스별 프리미티브. 속성: `_BLDG`(u16 셀내 건물 인덱스), `_FACADE`(u8×4: class, floors, tintIdx, flags), UV0 = 벽면 미터 좌표(u=벽 길이, v=높이) | render | L0–L1 |
| `roads.mesh` | glb | 차도·보도·연석·광장 | render | L0 |
| `decals.mesh` | glb | 노면 표시 (별도 폴리곤 오프셋) | render | L0 |
| `overrides.mesh` | glb | 랜드마크 수작업 모델 (PBR, 텍스처 참조는 shared) | render | L0 |
| `props.inst` | bin+gzip | 반복 `{u16 typeId, u16 pad, u32 count, f32[count*5] (x,y,z,yawRad,scale)}` | render (충돌 있는 소품은 파이프라인이 `collision.bin`에 프리미티브로 굽는다) | L0 |
| `trees.inst` | bin+gzip | `{u32 count}` + 레코드 `{u8 species, u8 seed, u16 pad, f32 x,y,z, f32 height, f32 crownR}` | render (줄기 충돌은 `collision.bin`의 원기둥) | L0–L1 |
| `collision.bin` | bin+gzip | §6 JCOL 포맷 | physics | L0 |
| `nav.bin` | bin | Detour NavMesh 타일 16개 연결 바이트열 (`{u32 count, (u32 len, u8[len])*}`) | sim | L0 |
| `lanes.bin` | bin+gzip | 차선 그래프 §7 | sim | L0 |
| `lights.bin` | bin+gzip | `{u32 count}` + `{u8 kind, u8 schedule, u16 kelvin, f32 x,y,z, i8x2 dirOct, u16 lumen, f32 range}` | render | L0 (L1은 발광 마스크) |
| `audio.json` | json+gzip | `{zones:[{kind, polygonLocal:[[x,z]…], y0, y1}], emitters:[{kind, pos}]}` | audio | L0 |
| `meta.json` | json+gzip | `{buildings:[{gmlId, usage, height, storeys, name?}], pois:[…], placeNames:[…], signals:[…]}` | ui, sim | L0 |
| `hlod.mesh` | glb | 병합·단순화 메시 (건물+지형), `_FACADE` 유지. **자식 셀 16개 영역별 프리미티브 분할**, 각 프리미티브 `extras.child = 0..15` (자식 인덱스 = (iz%4)*4 + (ix%4), 음수는 양의 나머지) | render | L1–L3 |

- `glb`: glTF 2.0 바이너리, `EXT_meshopt_compression` + `KHR_mesh_quantization`. 텍스처는 포함하지 않고 `extras.materialId`로 shared 머티리얼 참조.
- `gzip`: 런타임은 `DecompressionStream('gzip')`로 디코드(워커).
- 소비자가 모르는 섹션 타입은 무시(전방 호환).

## 5. `cells.idx`
`magic "TKCI"`, `u32 count`, 레코드 16 B × count, 정렬(level, iz, ix):
`{u8 level, u8 pad, i16 ix, i16 iz, u16 flags, u32 byteLength, u32 hash32}`
- flags bit0 = 수작업 오버라이드 포함, bit1 = 역/철도 포함.
- `byteLength` = .tkc 파일 바이트 수, `hash32` = .tkc 파일 전체의 XXH64(seed 0) **하위 32비트**(`tkcHash32`).
- reader: 파일 길이는 정확히 `8 + 16·count`(부족 `truncated`, 초과 `range`), 레코드는 엄격 오름차순(위반·중복 `corrupt`).
- 클라이언트는 부팅 시 1회 로드(MVP 약 400 레코드 ≈ 6 KB) → 존재하지 않는 셀 요청 방지, 크기 기반 대역폭 예측.

## 6. JCOL (collision.bin) 포맷
```
u32 magic 'JCOL', u16 version=1, u16 shapeCount
repeat shapeCount:
  u8 kind (0=triMesh,1=box,2=capsule,3=cylinder,4=convexHull)
  u8 layer (physics ObjectLayer, 08-physics.md §3)
  u8 material (0 concrete,1 asphalt,2 metal,3 glass,4 wood,5 grass,6 soil,7 tile)
  u8 flags (bit0 = oneSided stairs ramp proxy, bit1 = climbable)
  f32 pos[3], f32 quat[4]          (셀 로컬)
  kind 0/4: u32 vCount, u32 iCount, f32[vCount*3], u32[iCount]  (4는 iCount=0)
  kind 1: f32 halfExtents[3]; 2: f32 halfHeight, radius; 3: f32 halfHeight, radius
```
- 건물 삼각 메시는 셀당 1개로 병합(삼각형별 머티리얼 ID는 `u8[triCount]` 부가 배열로 확장 예정 → v2).
- 셰이프 헤더 32 B(모든 배열 4바이트 정렬). reader 거부: 미지 kind·kind 4의 iCount ≠ 0·iCount %3 ≠ 0·인덱스 ≥ vCount·비유한 실수(`corrupt`), 길이 부족(`truncated`, 배열 할당 전 검사). 끝 여분 바이트 무시.

## 7. lanes.bin
```
u32 'LANE', u16 version=1, u16 pad
u32 nodeCount; nodes: {u32 id, f32 x,y,z, u32 portalKey(0=내부)}      // portalKey = hash(글로벌 노드)
u32 laneCount; lanes: {u32 id, u32 fromNode, u32 toNode, u8 kind(0 road,1 turn,2 bus), u8 speedKmh, u16 signalGroup(0xFFFF=없음), u32 ptOffset, u16 ptCount, u16 widthCm}
u32 pointCount; f32[pointCount*3]
u32 groupCount; groups: {u16 id, u16 intersection, u8 phaseIndex, u8 pad[3]}
```
- 레코드 크기: node 20 B, lane 24 B, group 8 B. `fromNode/toNode` = 이 청크 **nodes 배열 인덱스**(id 아님, ADR-0017). `ptOffset/ptCount` = 점(xyz 3 float) 단위 범위. `signalGroup` = `groups[].id` 또는 0xFFFF.
- reader 거부: 노드 인덱스 ≥ nodeCount, 점 범위 초과, 없는 signalGroup, 비유한 좌표(`corrupt`), 길이 부족(`truncated`).

## 8. 버전 정책
- 포맷 비호환 변경 → `formatVersion` 증가 + ADR + 런타임은 단일 버전만 지원(구 빌드 즉시 폐기).
- 섹션 추가는 호환 변경 (formatVersion 유지).
- `@sanpo/tile-format`에 인코더/디코더 round-trip 테스트 필수 (`14-testing-perf.md §1`).
