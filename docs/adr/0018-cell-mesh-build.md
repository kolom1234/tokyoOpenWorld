# ADR-0018: L0 셀 빌드 — 공통 기준 높이장, RTIN 지형, 메시 양자화, buildId 재현성
- Status: Accepted
- Date: 2026-09-28

## Context
M01-T05에서 3×3 셀(L0_-2..0_-1..1)의 terrain.mesh·terrain.height·buildings.mesh·meta.json을 TKC로 조립했다.
수락 기준은 "셀당 ≤ 4 MB, 이웃 셀 지형 경계 높이 완전 일치, 2회 빌드 바이트 동일"이다. 스펙(04 §4.4, 05 §4)이 열어 둔 부분과
구현 중 측정으로 뒤집힌 부분을 여기 고정한다.

## Decision
1. **terrain.height 공통 기준**: 모든 셀이 `minH = HEIGHTFIELD_BASE_M = −100 m`, `step = 0.01 m`(f32)로 양자화한다
   (`quantizeHeightfield` 기본값 변경). 같은 DEM 샘플 → 같은 u16이므로 이웃 경계 행·열이 비트 단위로 같다.
   표현 범위 −100 … +555.35 m(23구 지형 충분). 포맷 필드는 그대로(`minH`는 v1에서 항상 −100) → formatVersion 유지.
2. **지형 단순화 = RTIN(정확 오차)**, meshopt simplify 대신. 실측(3×3, meshopt `LockBorder + ErrorAbsolute`, 5 cm):
   셀별 최대 수직 오차 0.16–0.64 m(평균 ≈ 1 cm), 경계를 따라 xz 면적 0인 수직 조각 18–35개, 접힌 삼각형 0–4개.
   RTIN(257² = 2^8+1 격자, mapbox/martini 번호 체계)은 삼각형마다 내부 모든 격자 샘플과의 오차를 정확히 재고, 빗변 중점 단위로
   분할을 결정·자식→부모 전파해 항상 정합(T-접합·접힘·퇴화 없음). 경계선 위 중점은 오차 ∞ → 1 m 간격 경계 정점 전부 유지(04 §6).
   결과: 모든 샘플 오차 ≤ 5 cm, 삼각형 수는 meshopt의 약 1.6배(셀당 29–47k), terrain.mesh 83–151 KB.
3. **terrain.mesh 정점**: POSITION = 셀 로컬 float32(양자화 안 함 — 경계 정점 높이를 DEM 값 그대로 두어 이웃과 비트 동일),
   NORMAL = int8 정규화(여유 1 m 샘플 중앙 차분 → 경계 법선도 이웃과 동일), `_SURF` = u8(현재 전부 7 plaza, M03에서 분류).
4. **buildings.mesh 정점**: 면별 평면 법선(int8), POSITION = u16 비정규 + 노드 translation(min)·**균일** scale(최대 변/65535, f32) —
   균일이라 법선 변환이 필요 없다. 오차 ≤ 5 mm. UV0 float32(벽: u = 수평 길이, v = 높이 / 지붕: u = x, v = z, 셀 로컬 m).
   `_BLDG` u16 = meta.buildings 인덱스(gmlId 사전순), `_FACADE` = (0, 층수, 0, 0). ground·closure 면 제외. 삼각분할 = earcut(지배 축 투영).
5. **glb 작성**: `@gltf-transform/core,extensions` 4.5.0 + `meshoptimizer` 1.3.0만 사용(functions는 sharp 네이티브 의존 때문에 제외).
   양자화·재정렬(`reorderMesh`)은 직접 수행, `EXT_meshopt_compression`(QUANTIZE 모드, 필터 없음) + `KHR_mesh_quantization` 필수 확장.
   머티리얼 ID는 glTF Material 이름 + primitive·material `extras.materialId` (`terrain_ground`, `facade_default`).
6. **buildId·재현성**: `YYYYMMDD-<git7>-<lock8>`, 날짜 = `SOURCE_DATE_EPOCH` 또는 현재(UTC), git SHA는 `.git`을 직접 읽음(컨테이너에 git 없음),
   lock8 = `sources.lock.json` sha256 앞 8자리. world.json `createdAt` = buildId 날짜의 00:00Z(시각 제외). 재현성 검사는
   `tools/pipeline/scripts/repro-build.sh`(같은 컨테이너에서 2회 빌드 + sha256 비교 + validate).
7. **validate**: ajv 8.20.0(2020-12, strict)로 world.json·셀 헤더(원문 JSON)·meta.json 검사, `date-time` 형식은 정규식 등록.
   L0 크기 예산 = 4,000,000 B(10진 MB). 이웃 경계: 높이장 u16 행·열 + terrain.mesh 경계 정점(좌표·높이 Object.is) 완전 일치.
   `schemas/world.schema.json`의 `$ref: "sanpo/area"`는 `$id` 기준 상대 해석으로 `sanpo/sanpo/area`가 되어 해석 불가 → `"area"`로 수정.

## Consequences
- 물리(terrain.height)와 렌더(terrain.mesh) 모두 셀 이음새가 비트 단위로 닫힌다. 셀 1개 재빌드가 이웃을 깨지 않는다(04 §1).
- 지형 삼각형이 늘었지만 셀 크기는 484–903 KiB(예산의 ≤ 23%).
- 높이 범위 밖(< −100 m, > 555 m)이 필요해지면 기준 변경 = 모든 셀 재빌드(포맷은 호환).
- 건물 정점은 면별 분리(평면 법선)라 정점/삼각형 ≈ 1.9 — 크기가 문제되면 weld(같은 법선 정점 병합) 검토.

## Alternatives
- meshopt simplify 유지 + 오차 목표 축소(예: 1 cm): 여전히 근사 오차라 상한 보장 없음, 경계 조각 문제 동일 → 기각.
- 셀별 minH 유지 + 경계 샘플 보정: 리더가 복원한 f32 높이가 μm 단위로 달라 "비트 일치"가 안 됨 → 기각.
- 지형 POSITION u16 양자화(공통 기준·스텝): 가능하지만 노드 스케일·셀 로컬 x/z 범위를 모두 전역 고정해야 하고 이득(≈ 수십 KB)이 작음 → 보류.
