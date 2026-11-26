# ADR-0109: 원경 지면 분류 = hlodExtent 전체 토지피복 텍스처 1장 (셀·HLOD 메시 변경 없음)
- Status: Accepted
- Date: 2026-11-27

## Context
- 상공·원경 지면이 한 가지 색이었다(그래픽 분석 D2): HLOD 지형 `_SURF`는 7(plaza)로 고정(`child-split.ts`), 렌더도 단색. 공원·강·바다·선로가 보이지 않았다.
- HLOD 지형은 RTIN(높이 오차 기준)이라 평지(도쿄 대부분)는 삼각형 한 변이 수십–수백 m — 정점마다 분류를 넣으면 공원·도로 경계가 뭉개진다.
  분류 경계를 지키려고 RTIN을 쪼개면 정점·셀 크기(HLOD 예산 ≤ 2–3 MB)가 늘고 HLOD 전체 재빌드가 필요하다.
- OSM 정규화(`normalize --layer osm`)는 L0 영역 + 500 m만 있다. 원경(hlodExtentWF 48 km)에는 별도 추출이 필요하다.

## Decision
1. **토지피복 텍스처 1장**: hlodExtentWF 전체를 8 m 분류 격자(0 도시 바닥 · 1 도로 · 2 녹지 · 3 물 · 4 선로)로 칠하고 2×2 평균 → **16 m RGBA 비율**(R 물 · G 녹지 · B 도로 · A 선로) PNG(3072² ≈ 2.6 MB).
2. 원천: 간토 PBF(sources.lock 고정판)를 hlodExtent로 osmium extract → 물(natural=water·water=*·riverbank·reservoir·basin)·녹지(공원·정원·잔디·숲·묘지 등)·선로(landuse=railway) 면,
   도로(motorway–residential, 등급별 반폭 3–12 m)·선로(반폭 6 m) 선. 터널·지하·덮개는 뺀다. 해면 = 원경 DEM 자료 없음(정확히 0 m). 칠하는 순서 녹지 → 물 → 선로 → 도로(뒤가 이김).
3. 배포: `landcover --build-id`가 `shared/landcover/{landcover.png, landcover.json}` + world.json `files.landcover`(선택 키 — 옛 빌드는 없음). 게임은 첫 표시 뒤 `render.loadLandcover`(머티리얼과 같은 "안정" 조건).
4. 렌더: HLOD 지형 머티리얼이 월드 xz(화면 위치 + 렌더 원점 유니폼)로 샘플링(선형·밉맵, 데이터 텍스처 — 색공간 변환·알파 곱·뒤집기 없음) → L0 지형과 같은 레이어 평균색
   (도시 바닥 = 콘크리트 + 아스팔트 35 %, 도로 = 아스팔트, 녹지 = 잔디, 선로 = 자갈 + 도시 35 %), 물 = 짙은 청록·거칠기 0.12. 텍스처 없으면 도시 바닥 한 색.
5. ODbL: 래스터 = 같은 OSM 추출본의 파생 DB → 빌드에 공개(래스터 자체) + `global/odbl/README.txt` 고지(`ensureLandcoverNote`) + 방법 = 공개 파이프라인(4.6b).

## Consequences
- 셀·HLOD 메시·TKC 형식 변경 0, HLOD 재빌드 불필요. 세션당 요청 +1(첫 표시 뒤, `immutable` 캐시), 전송 ≈ 2.6 MB(첫 로드 예산 밖 — 지연 적재), GPU ≈ 37 MB(RGBA 3072² + 밉맵).
- 16 m라 L1 가까운 거리(≈ 400–600 m)에서는 대각 선로·공원 경계가 계단처럼 보인다 — 원경(L2·L3)에서는 충분. 필요하면 8 m(GPU ×4) 또는 L1 셀별 고해상도 조각을 검토.
- 지역 확장(M13+)은 hlodExtentWF를 넓히면 같은 단계로 다시 만든다.

## Alternatives
- 정점별 `_SURF`(기존 속성) → 평지 삼각형이 커서 경계가 뭉개짐 → 기각.
- 분류 경계를 지키는 RTIN → 정점·셀 크기 증가 + HLOD 전체 재빌드 → 기각.
- TKC 셀마다 토지피복 섹션 → 형식·인코더·디코더·스트리밍 변경, 셀 수만큼 작은 텍스처 → 1장 공유 에셋보다 복잡 → 기각(해상도가 더 필요해지면 재검토).
- 지리원 항공사진(seamlessphoto) 저주파 색 → 측량법·이용규약 검토 필요, 그림자·지붕이 섞인다 → 기각(분류 + 재질 평균색이 L0와 이어진다).
