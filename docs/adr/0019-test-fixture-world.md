# ADR-0019: 테스트 픽스처 월드(world-mini·plateau-mini)와 `?world=mini` 로드 경로
- Status: Accepted
- Date: 2026-09-28

## Context
M01-T06(렌더)을 클라우드 세션에서 하려면 원천 데이터·GDAL 없이도 저장소 안에 실제 셀 데이터가 있어야 한다. R2·KV 바인딩은 아직 없고(ADR-0015, Pre-flight 미완),
staging/PR preview에는 월드 빌드가 없다. CI e2e도 부팅할 월드가 필요하다. 그래서 M01-T07을 T06보다 먼저 진행했다.

## Decision
1. **world-mini** = L0 2×2(ix −1..0 × iz −1..0): 스크램블 교차로(스폰, L0_-1_0)와 스크램블 스퀘어(L0_0_0)를 포함. M01-T05 `buildArea` → `validateBuild`(0 오류 필수)를
   그대로 쓰는 `pnpm pipeline fixture`(컨테이너 전용)로 만들고 `world.json`·`cells.idx`·`L0/**`·`ATTRIBUTION.json`만 `tests/fixtures/world-mini/`에 커밋한다.
2. **plateau-mini** = 셀 L0_-1_0의 원천 발췌: CityGML 원문에서 건물 5동(높은 순, member ≤ 60 KB)·도로 3개(작은 순)만 텍스트 단위로 잘라 원래 파일 이름으로 저장
   (appearance 블록 제거), DEM은 GDAL 재투영이 필요하므로 `dem_1m.tif`의 1셀 ± 1 m 창(Float32 gzip)을 가공 조각으로 둔다. 단위 테스트는
   normalize(SAX) → build → 섹션 해시를 `expected.json`과 비교한다. gzip 섹션은 **해제 바이트**로 해시해 zlib(Node) 버전과 무관하게 한다.
   (실측: 컨테이너 Linux Node 24와 Windows 호스트 Node의 스냅샷이 같다.)
3. **로드 경로 = URL 플래그 `?world=mini`** → 게임은 `/api/world/current` 대신 `/fixtures/world-mini`를 base URL로 쓴다.
   - dev: Vite 미들웨어가 저장소 폴더를 직접 서빙. build: `dist/fixtures/world-mini/`로 복사 → `vite preview`(CI e2e)·PR preview·staging 정적 에셋.
   - production 빌드는 `SANPO_WORLD_MINI=0`으로 복사하지 않는다(테스트 데이터 비공개·용량).
   - 로더(`apps/game/src/world-load.ts`)는 world.json의 formatVersion·`crs`를 `WORLD_ORIGIN`과 대조하고, cells.idx 후 스폰 셀 ± 1의 TKC를 받아 크기·헤더(셀·buildId)를 확인한다.
     셀 전체 해시 검사는 메인 스레드 4 ms 규칙 때문에 하지 않는다(M02 디코드 워커에서).
4. **e2e 판정** = 부트 화면 `#app[data-world="loaded"][data-world-source="fixture"][data-world-cells="4"]` + `data-isolated="true"` + 콘솔 오류 없음. CI `e2e` 잡(Playwright 1.63.0, Chromium headless shell).
5. 픽스처는 생성물이라 Biome 대상에서 제외하고 `.gitattributes`로 바이너리(`*.tkc`·`*.idx`·`*.gz`)·원문 GML(`-text`) 바이트를 보존한다.

## Consequences
- 클라우드 세션·CI가 원천 없이 실제 시부야 셀로 렌더·스트리밍 작업을 할 수 있다(저장소 +3.4 MB).
- 셀 포맷·빌드 코드가 바뀌면 `pnpm pipeline fixture`로 재생성해야 한다(`fixtures.test.ts`가 world-mini validate·plateau-mini 스냅샷 불일치로 알려 준다).
- world-mini `buildId`에는 생성 시점 날짜·git SHA가 들어간다(재생성마다 바뀜 — 의미 없음).

## Alternatives
- 로컬 R2(`seed:local`)에 world-mini 업로드: dev만 해결되고 PR preview·CI는 R2가 없어 불가 → 기각.
- `apps/game/public/`에 직접 커밋: 픽스처가 두 곳으로 갈라지고 production에서 뺄 수 없다 → 기각.
- 원천 FGD DEM xml 발췌: 셀 빌드 전에 GDAL 재투영이 필요해 CI 단위 테스트에서 못 쓴다 → 가공 창 사용.
