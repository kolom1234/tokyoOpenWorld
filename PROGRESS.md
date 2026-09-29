# PROGRESS
Updated: 2026-09-29 (session #15 — 큐 모드 M03 Rendering Realism I, 브랜치 `claude/m03-queue`, draft PR)

## Current Milestone: M03 — Rendering Realism I (진행 순서: T10 → T01 → T02 → T03 → T04 → T06 → T05 → T07 → T08 → T09)
## Current Task: M03 큐 완료 — PR #15(draft) 사용자 검토 대기
- Done in this session: M03-T10(골든뷰 인프라, 앞당김), M03-T01(머티리얼 라이브러리), M03-T02(대기·하늘), M03-T03(태양·그림자·시계), M03-T04(절차 파사드), M03-T06(지면·도로 머티리얼 + staging 첫 반영), M03-T05(유리·실내 매핑), M03-T07(후처리 — 성능 기준 미달), M03-T08(품질 티어·동적 해상도), M03-T09(WebGL2 폴백).
- In progress: –
- 골든뷰: `pnpm golden`(tests/golden/README.md) — core 4장 before = `docs/screenshots/M03/base/`. 태스크마다 `GOLDEN_SAVE=M03/<Tnn>`.
- 배포 상태: staging Worker `tokyo-sanpo-staging` = **75629ce 코드**(M03 전체) + dev 버킷 빌드 **`20260929-b84bfa1-ec1646fc`**(L0 294 + HLOD 177 + shared/materials(실내 큐브맵 포함), 478 파일 248.9 MB, current).
  dev 버킷 옛 빌드(gc 대기, 7일 규칙): `20260929-c9a28d3-ec1646fc`(T06, 10/6~), `20260928-b2d1e36-7fb58d45`(M02-T07, 10/6~), `20260928-7e215f4-7fb58d45`(10/5~). `pnpm pipeline gc --env dev --apply`(2026-09-29 dry-run = 0).
  staging 첫 로딩(GOLDEN_BOOT, 최종): **12.68 MB**·첫 표시 11.3 s. 머티리얼(첫 표시 뒤 지연) 18.18 MB. staging 골든 core 4장 = `docs/screenshots/M03/final-staging/`.
- 로컬 최신 빌드 = staging과 같음(`20260929-b84bfa1-ec1646fc`).
- Next step (정확히 한 걸음): 사용자가 PR #15를 검토·머지하면 M03 성능 후속 태스크 정리(공중원근 ≈ 6 ms·TAAU ≈ 8 ms 고정 비용, 파사드 ≈ 6 ms 오버드로우 → 깊이 프리패스, WebGL2 금속 파사드 어두움) 후 M04 착수.
- Blockers: 없음

## Recently Completed
- M03-T09 WebGL2 fallback parity — backend-caps 소프트웨어 래스터 판정(SwiftShader·llvmpipe → 직접 렌더 유지), **하드웨어 WebGL2 = 같은 후처리 + 환경 프로브 + CSM 그림자**,
  Medium 상한(T08), 자동 노출(컴퓨트) 끔 → 고정 1.25, 유리 거칠기 하한 0.16(거울 띠 과다 보정), TSL `packNormalToRGB/unpackRGBToNormal`(r186 이름).
  **수락**: `?backend=webgl` 실제 GPU 골든 5뷰(`docs/screenshots/M03/T09-webgl2/`) 오류·경고 0, tier medium·GTAO 적용. 남은 차이: 일부 금속·커튼월 파사드가 더 어둡다(후속).
  e2e(SwiftShader) 5/5 불변. 테스트 +1파일/+1건. ADR-0037, ADR-0028 부록 (2026-09-29)
- M03-T08 Quality tiers & dynamic resolution — render `quality.ts`(detect-gpu 벤치마크 자체 호스팅 `/detect-gpu/` → low/medium/high, WebGL2 상한 medium, 60프레임 측정 뒤
  동적 해상도 바닥에서도 느리면 한 단계씩 강등, 버스 `quality/changed` 양방향), `renderer/dynamic-resolution.ts`(EMA 17.5/17.1 ms, ±0.05, 시도-후퇴 백오프),
  post `setRenderScale`(PassNode·RTT·GTAO·SSR, TAA는 항상 TAAU), API `setQuality`·`detectQuality`·stats `quality`·config `dynamicResolution/gpuBenchmarksPath/debugGpuLoad`.
  game `wiring/quality.ts`(localStorage `sanpo.quality.v1`, 첫 표시 뒤 감지), `?dynres=0`·`?gpuLoad=n`, vite `sanpo-gpu-benchmarks`. 골든뷰 = High 고정·동적 해상도 끔.
  **수락**(3050 Laptop): 1080p Medium + gpuLoad 200 — 고정 0.75 = 22.4 ms → 동적 0.5 ≈ 16.7–18.6 ms(렌더 스케일 하강 ✅, 16.6 ms 완전 유지 ✗ — 해상도 무관 고정 비용).
  1440p High는 0.5에서도 ≈ 23 ms(TAAU 해석 ≈ 8 ms 고정). detect-gpu: RTX 3050 Laptop → tier 3 → high. 테스트 +3파일/+9건. ADR-0036 (2026-09-29)
- M03-T07 Post pipeline — render `post/{pipeline,config,exposure,lut}.ts`: MRT(output·normal+roughness·velocity·[diffuse+metalness], 24 B) → GTAO/SSGI → SSR(가산) →
  aerialPerspective → 컴퓨트 자동 노출(부분 적응) → Bloom(¼) → TRAA/TAAU(렌더 스케일) → renderOutput → 절차 3D LUT → Sharpen. API `QualityTier`·`PostEffects`·
  `RenderConfig.quality/post`·stats `post/exposure`, game `?quality=`·`?post=`(`debug/post-flags.ts`). 티어: Low 0.6 / Medium 0.75 GTAO / High 0.85 GTAO+SSR+Bloom / Ultra 1.0 SSGI+Sharpen.
  **SSGI는 Ultra만**(r186 해상도 배율 없음, +100 ms↑ — 07 §9 이탈). **성능 미달**: 1440p 3050 Laptop 스크램블 모두 끔 25.9 → High 35.9 ms(3060 환산 순증 ≈ 4.3 ms,
  공중원근 포함 ≈ 7 ms > 4 ms). 안 빼기: GTAO 3.5·Bloom 3.0·Sharpen 2.2·SSR 1.6·노출 0.6·LUT 0.5, 공중원근 ≈ 6, TRAA ≈ 8.
  골든 `docs/screenshots/M03/T07/*`(노출 배율 metrics). 테스트 +2파일/+4건. ADR-0035 (2026-09-29)
- M03-T05 Glass & interior mapping — pipeline `materials/{interior-rooms,interiors}.ts`(방 8종 상자 가구·조명판 → 방 중심 6면 광선 추적 → 256² PNG 48장 →
  `interiors.ktx2` ETC1S 2D 배열 0.14 MB, manifest `interiors`, 스키마·validate), `lib/png.ts` RGB 인코더. render `facade/interior.ts`(베이×층×깊이 방 상자 교차 →
  면·LOD, 창별 방·좌우 반전, 유리 픽셀에서만 `If` 분기), `materials/glass.ts`(실내 발광 × (1−프레넬) × 투과율, 블라인드 확산면), library `maps.interiors`·방 평균색.
  **수락**: `docs/screenshots/M03/T05/shinjuku-curtainwall-close.jpg`(서신주쿠 초고층 근접 — 창마다 실내·블라인드·소등 방), `class-mansion.jpg`(가구 실루엣 깊이감) — 육안.
  **성능**: 파사드 단색 대비 ≈ 6.0 ms(T04 4.7 → +1.3, 분기 전 +2.7). core GPU 23.8/22.9/24.9/28.7 ms. 새 골든뷰 `shinjuku-curtainwall-close`. 테스트 +1파일/+4건. ADR-0034 (2026-09-29)
- M03-T06 Terrain & road base materials — pipeline `surface-class.ts`(셀+8이웃 PLATEAU 도로 폴리곤 → 257² 1 m 래스터: 차도·횡단보도 0, 보도·교통섬 1, 나머지 7),
  RTIN 분류 경계 세분(차도 경계 1 m·그 밖 4 m, `edgeKeyOf`), HLOD 지형 7 고정. render `materials/{terrain,road,noise}.ts` + `weather/wetness.ts`:
  `_SURF` 원-핫 보간 → 상위 2클래스 반대칭 노이즈 경계, 주 클래스 회전·축척 2표본 분산 보존 혼합(안티타일링), 아스팔트 패치·유분·바램/보도 명암·때, 거시 명암,
  젖음(`WeatherParams.wetness` core 계약 추가 → `EnvUniforms.wetness`; 흡수율 어두워짐·수막·물웅덩이), triplanar는 `TerrainOptions.triplanar`(기본 끔, T08 티어).
  game `?wet=0..1` + 슬라이더(`debug/wet-override.ts`), 골든 `weather: 'rain'` = 0.85, 새 골든뷰 `road-ground-30m`.
  **수락**: `docs/screenshots/M03/T06/road-ground-30m.jpg` — 눈높이 30 m 차도에서 타일 반복 식별 안 됨(육안), 젖음 `M03/T06/wet/*`.
  **성능**: 첫 구현 +12 ms(ALU 해시 노이즈 ≈ 160회/픽셀) → 노이즈 텍스처·noiseBank 4표본·법선 1표본으로 지형 순증 ≈ +1.2–1.8 ms. core 4뷰 GPU 23.2/21.9/25.0/28.0 ms(T04 21.3/20.8/24.8/26.0).
  빌드 L0 122.3 → 132.9 MB(+8.6 %). **staging 첫 반영**: publish에 shared/materials 추가, KTX2 트랜스코더 CSP(부트스트랩 워커, ADR-0032), 하늘 별 끔(외부 데이터).
  픽스처·디코드 스냅샷 재생성. 테스트 +2파일/+6건. e2e 5/5. ADR-0031·0032 (2026-09-29)
- fix(streaming) 부팅 첫 표시 exclusive whenReady — 대기 중 대상만 요청 → staging 초기 다운로드 79.0 → 12.7–13.4 MB(14 §2 ≤ 60 MB 회복). 테스트 +1건. ADR-0033 (2026-09-29)
- M03-T04 Procedural facade — pipeline `facade-params.ts`(용도·높이 → class 6종·상점·커튼월·tint·창 시드, L0+HLOD), 벽 UV0 = (평면 묶음 시작점, 건물 바닥) + TEXCOORD_1(면 폭·건물 높이),
  `wall-planes.ts`(LOD2 벽 띠 군집, 벽에 붙은 부속물 제외), render `materials/facade/{grid,walls,windows,retail,details,index}.ts`(층·베이, 벽 그룹×틴트, 창 SDF·프레임, 1층 쇼윈도·간판 띠·차양·셔터, 슬래브·빗물·AO).
  버그: 면 상수 보간 오차로 베이 수가 픽셀마다 뒤집힘 → **flat varying**(ADR-0030 §4).
  **수락**: 클래스 4종 샘플(`docs/screenshots/M03/T04/classes/class-{office,mansion,house,commercial}.jpg`) — 오피스 띠창·맨션 발코니 문·주택 드문 창·상업 1층 상점 구분됨(육안).
  **파사드 GPU 비용 ≈ 4.7 ms**(1440p 도청 면 가득, 무제한 프레임 A/B 20.4 vs 15.7 ms, RTX 3050 Laptop) — 기준 1.5 ms(RTX 3060, 환산 ≈ 2.1 ms) **미달** → T07 깊이 프리패스 공유·T08 동적 해상도.
  core 4뷰 GPU 21.3/20.8/24.8/26.0 ms. 빌드 MVP L0 122.3 MB. e2e 5/5(재설정 허용 0.02% z-파이팅). 픽스처 재생성. 테스트 +3파일/+9건. ADR-0030 (2026-09-29)
- M03-T03 Sun, shadows, clock — sim: `createSim`(WorldClock realtime/custom/frozen·04:00 운행일 요일, `environment()` = suncalc 2.0.2 → 수렴각 → WF, 관측점 1 km 격자 스냅),
  game `wiring/env.ts`(phase 66, 기본 시계 = 오늘 12:00 JST 1배속, `?time=`·골든뷰 time = frozen), render CSM(takram CascadedShadowMapsNode, 4 × 2048²·600 m·fade, `?shadows=0`),
  WebGPU 하늘 배경 제거(환경 프로브와 겹쳐 배경 머티리얼 매 프레임 재빌드 → 30 FPS였음), **GPU 타이머 정정**(three 반환값은 마지막 frame id만 → 풀 합산, 무제한 프레임과 일치).
  **수락**: 2026-06-21 시부야 남중 **11:43 JST 고도 77.782°·방위 180.05°**, 12:00 **77.237°**(테스트). 캐스케이드 경계: 상공 150 m 사선 시점·태양 25°에서 이음새 없음(fade).
  GPU(1440p): 스크램블 20.1 · 서신주쿠 18.9 · 요요기 23.6 · 주택가 22.9 ms(그림자 끔 17.6/17.2/25.2/22.5 — 잡음 ±2 ms). e2e 5/5(시각 고정). 테스트 +3파일/+13건. ADR-0029 (2026-09-29)
- M03-T02 Atmosphere & sky — takram three-atmosphere 0.19.1 WebGPU: `lighting/atmosphere.ts`(AtmosphereContext·AtmosphereLight·skyBackground, WF→ECEF = 원점 타원체 위치(TP + 지오이드 36.7 m)·NUE·수렴각 γ, 원점 재설정마다),
  `env-probe.ts`(SkyEnvironmentNode 64² → PMREM, 라이트 간접 끔), `post/pipeline.ts`(pass MRT → aerialPerspective → AgX, 노출 3; WebGL2는 직접 렌더), `setEnvironment()`, GPU 타이머(`?gpuTiming=1`, `stats().gpu`),
  game `?sun=az,el`·`?exposure=`·`?gpuTiming=1`, `three-compat.ts` alias. **three r186 호환 패치**(patches/: struct Proxy `.layout.name`, LUT `requestIdleCallback` 타임아웃 — 없으면 조명·하늘이 검다) + precompile에서 LUT 계산 await.
  **수락**: 요요기 상공 300 m 일출(방위 70°·고도 2°)·정오(180°·70°)·일몰(290°·2°)·황혼(290°·−5°, 노출 40) 4장 — 지평선 붉어짐·정오 원경 청색 연무·황혼 잔광 확인(`docs/screenshots/M03/T02/sky-*.jpg`).
  GPU 프레임 수치는 타이머 버그로 틀렸음(→ T03에서 정정: 그림자 없이 17.2–25.2 ms). 첫 로딩 증가 0(에셋 없음). e2e 5/5(WebGL2). 테스트 +2파일/+6건. ADR-0028 (2026-09-29)
- M03-T01 Material library & texture arrays — ambientCG CC0 32종(`content/materials/library.json`: 아스팔트 3·보도 4·콘크리트 4·타일 벽 6·금속 3·미장 2·사이딩 2·ALC·벽돌·지붕 2·잔디 2·흙·자갈; 유리는 T05 절차),
  pipeline `materials`(`stages/materials/{library,fetch,encode,run}.ts`: zip sha256 lock(`ambientcg`, `--update-lock`) → ImageMagick 리사이즈·ORM 패킹 → toktx 4.4.2 KTX2 배열 → 캐시 `data/derived/materials/<hash>` → `--build-id` 설치) + validate(`validate-materials.ts`, `schemas/materials.schema.json`).
  크기: albedo 1024² ETC1S 6.3 MB · normal 512² UASTC 7.0 MB · ORM 512² UASTC 4.7 MB = **18.0 MB**(1024² 3장은 55.8 MB → ADR-0027). 인코딩 ≈ 2.5 min.
  render: `materials/library.ts`(자리표시 배열 → manifest 평균색 → KTX2 교체, 재컴파일 없음), `textured.ts`(지형 `_SURF` 그룹·월드 XZ, 파사드 건물 해시 벽 그룹·UV0), `loadMaterials(url)`·`stats().materials`, context/frame/service 분리.
  game: 첫 표시 뒤 `loadMaterials(world.json files.materials)`, `three`→`three/webgpu` alias, `/basis/*` 트랜스코더 서빙·복사, 오버레이 머티리얼 줄.
  **수락**: GPU 텍스처 메모리 **67.1 MB**(BC7, ≤ 400 MB), 적재 0.6–1.4 s, 모든 레이어 출처(ATTRIBUTION `ambientcg-<asset>` 32건, sources.lock sha256 32건 — 테스트가 대조). 첫 표시 전송에 머티리얼 0.08 MB(manifest)만 — 텍스처는 첫 표시 뒤.
  버그 2건 수정: 큰 float 시드 varying 보간 → 픽셀 노이즈(uint 결합으로), 1성분 정수 속성 WebGL2 타입 불일치(`_SURF`·`_BLDG` f32, `_FACADE` unorm8x4). e2e 5/5(WebGL2) 통과. 테스트 +2파일/+10건. ADR-0027 (2026-09-29)

## Known Issues
- [render/webgl2] 하드웨어 WebGL2에서 일부 금속·커튼월 파사드가 WebGPU보다 어둡다(환경 프로브 반사 차이, 원인 미확정 — M03-T09).
- [e2e] 로컬에서 부하가 있을 때 e2e 1건이 가끔 실패(재실행 통과, 2026-09-29 T07·T08 중 2회) — 어느 스펙인지 미확인. CI에서 재현되면 조사.
- [render] 그림자 티어화(07 §9 그림자 행: 캐스케이드 수·해상도·거리)는 CSM 재생성이 필요해 미구현 — 모든 티어가 4×2048·600 m.
- [perf] 후처리 1440p High ≈ 7 ms(3060 환산, 기준 4 ms) — 공중원근(takram) ≈ 6 ms·TRAA/TAAU ≈ 8 ms(3050 Laptop)가 크다. 파사드 ≈ 6 ms(기준 1.5). T08 동적 해상도로 16.6 ms 유지, 근본 절감은 후속(2026-09-29).
- [perf] gpu-timer(timestamp 합산)는 패스·컴퓨트가 많으면 값이 튄다 → 후처리 비교는 무제한 프레임 p50(scratch cpu.mjs)로. `pnpm perf`(M02-T07~)에 반영 필요.
- [perf] 첫 표시 ≈ 11 s(12 s 목표 근접) — 선컴파일 ≈ 5 s·대기 LUT. 첫 표시 직후 HLOD 1–2 s 디졸브(ADR-0033). T07/T08에서 선컴파일 병렬화 검토.
- [render] 지면 `_SURF` 7(plaza)이 공원·녹지까지 덮음(요요기 콘크리트색), 도로 가장자리 1 m 계단 — M05 토지이용·도로 메시 전까지.
- [render] 파사드 셰이더 ≈ 4.7 ms @1440p(RTX 3050 L) — 수락 1.5 ms 미달(ADR-0030). T07 깊이 프리패스(오버드로우 제거)·T08 동적 해상도 후 재측정.
- [pipeline] PLATEAU 동일 평면 중복 면 z-파이팅 잔존(WebGL2 원점 재설정 e2e ≈ 70 px). 벽–벽 중복 제거는 필요 시 M05-T07.
- [perf] 1440p GPU 17–25 ms(RTX 3050 Laptop): 씬 패스 12–17 ms + 공중원근 쿼드 5–10 ms. 07 §10(RTX 3060 ≤ 12 ms) 빠듯 → T07(후처리)·T08(동적 해상도)에서 줄일 것.
- [render] 고정 노출 3(자동 노출 T07 전) → 황혼·밤은 매우 어둡다. WebGL2 폴백은 공중원근 없이 직접 렌더(SwiftShader 1.4 FPS 회피) — T08/T09 품질 티어에서 재결정(ADR-0028).
- [render] takram 패치(patches/)는 three r186 전용 — three/takram 버전을 올리면 패치 재확인.
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05는 도로 메시 없음 → M03 도로 빌드 때 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → zip에서 필요한 것만 수동 해제(`data/raw/plateau-{shibuya,shinjuku,meguro}/extracted/`: MVP 24메시 udx/bldg·tran + codelists + schemas, 2026-09-29). 23구 zip은 풀지 않음(hlod-prep 스트림). 標高タイル은 hlod-prep이 받음. fetch 구현 시 lock sha256 검증.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유 → MVP 294셀은 `NODE_OPTIONS=--max-old-space-size=12288`로 통과(2026-09-29). 23구 전체 L0로 넓힐 때 셀별 스필 필요.
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함). M01-T05 실측: 셀 밖 돌출 최대 68.2 m(L0_-1_0, 허용 256 m) → 유지. 발자국 기준 전환은 294셀 빌드에서 문제가 보이면.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] e2e = 부트·월드 로드(`boot.spec.ts`) + 렌더 스모크(`render.spec.ts`, WebGL2/SwiftShader 강제) + 디코드 워커(`decode.spec.ts`, `?probe=decode`). WebGPU 경로는 CI에 GPU가 없어 미검증 → 로컬 실제 GPU(Chrome headed, `channel: 'chrome'`)로 확인(2026-09-29). 걷기·모드 전환은 M04 이후. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
- [e2e] 클라우드 세션 Chromium은 Playwright 번들 버전과 달라 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`로 실행. 실행 전 떠 있는 `vite preview`가 있으면 `reuseExistingServer`로 **옛 빌드**를 테스트하니 먼저 종료할 것.
- [perf] 초기 다운로드(첫 표시 시점 전송량) 57–62 MB — 14 §2 예산 60 MB 경계. 부팅 순서상 L3 9·L2 ~36·L1 ~16이 스폰 L0보다 먼저 온다(06 §8). 초과가 이어지면 부팅 whenReady 전 L2 반경 축소 또는 HLOD 크기 조정(M03 perf 하네스 `pnpm perf`에서 판단).
- [perf] `pnpm perf`(자동 비행 경로·perf-latest.md)는 아직 없음 → 이번 수치는 Playwright + 실제 Chrome 스크립트(세션 scratchpad) 측정. perf 하네스 태스크에서 재현.
- [render] 셀 추가 프레임의 GPU 업로드(다음 render에서 발생): 큰 L1 셀 1개(≈ 7 MB)가 그 프레임 render를 5–10 ms 늘린다(프레임 드롭은 없음, 18.3 ms 최대). 업로드 분할·HLOD 셀 크기는 `pnpm perf`(M02-T07~) 뒤 판단(ADR-0025). 첫 프레임 render 33–57 ms(초기 업로드) 1회.
- [render] L0 셀은 페이드 인 없이 즉시 나타나고 부모 그룹이 0.3 s 디더로 사라진다(겹침 0.3 s, 점묘). freecam 관심점엔 forward가 없어 뷰 쐐기 우선순위 미적용(traversal 개선 시).
- [game] 게임 번들(three 포함) ≈ 1.05 MB(gzip 300 KB) → Vite 500 kB 경고. 코드 분할은 M03(후처리·대기 추가 시) 재검토.
- [fixtures] world-mini·plateau-mini는 생성물 → 셀 포맷·빌드 코드 변경 시 `docker/run.sh node tools/pipeline/src/cli.ts fixture`로 재생성(`fixtures.test.ts`가 불일치를 알려 줌). plateau-mini 건물은 appearance 제거로 UV 없음, 도로는 normalize 테스트용(셀 빌드에 도로 섹션 없음).
- [game] 부트 상태 화면(src/status-view.ts)은 DOM 임시 구현 → @sanpo/ui(M08) 로딩 화면으로 대체.
- [streaming] 워커 사망 시 진행 중 작업은 `worker` 오류 → lifecycle `failed` → 60 s 뒤 재요청(더 빨리 재시도할지는 T07 실측 후). 워커가 'failed'(재시작 포기)면 풀이 다음 호출/메시지 때 sweep으로 정리.
- [streaming] Cache Storage 세션 간 LRU는 저장 순서(FIFO) 근사, 기존 항목 크기는 Content-Length(없으면 1 MiB 가정) — ADR-0023. 브라우저에서 seed 시간 미측정(M02-T05/T07).
- [streaming] 디코드 시간은 클라우드 컨테이너 headless Chromium 값(ADR-0022). 실제 데스크톱 수치는 `?world=mini&probe=decode` → 콘솔 `__SANPO_DECODE_PROBE__`로 확인. e2e는 병렬 SwiftShader 테스트와 CPU 경합 → `postMs`는 중앙값으로 판정.
- [streaming] 재계산은 Node 실측 평균 0.41 ms(ADR-0023). 첫 호출 ≈ 8 ms(JIT) → 부팅 로딩 중이라 허용, 브라우저 수치는 `pnpm perf`(M02-T07~). 고고도 L1 +16셀 메모리는 M02-T04 HLOD 크기로 확인(ADR-0021).
- [worker] miniflare 통합 테스트는 `wrangler dev`를 띄워 ≈ 15–25 s(CI 포함). 느리면 `SANPO_SKIP_MINIFLARE=1`. 이 PC에 9/26–27부터 떠 있는 workerd 8개는 이번 세션 것이 아님(건드리지 않음).
- [publish] R2 S3 키가 없어 `api` 업로더(REST) 사용 중 — HEAD 검증은 Worker 경유. S3 키를 발급하면(대시보드 R2 → API 토큰, 두 버킷 Object Read & Write) 자동으로 `s3` 업로더.
- [ci] Biome `noExcessiveLinesPerFunction`이 일부 함수(예: 객체 반환 팩토리)를 놓침 → `scripts/check-size.ts`가 정본(docs/15 §2).
- [tile-format] `props.inst`·`trees.inst`·`lights.bin`·`audio.json` 인코더/디코더 미구현(레지스트리·모델 타입만) → 해당 태스크(M04~)에서 추가. 헤더 gzip(flags bit0)은 v1 미지원(ADR-0017).
- [pipeline] validate 미구현 항목: 랜드마크 20곳 정확도 샘플, report.html(현재 report.json·report.md), world.json·셀 간 교차 검사 일부. 증분 캐시(`data/build/.cache`)도 미구현 → 매 빌드 전체 재생성(3×3 ≈ 5 s).
- [pipeline] terrain `_SURF`는 전부 7(plaza) 임시값 → M03 도로·녹지 분류. buildings.mesh는 면별 정점(weld 없음, 정점/삼각형 ≈ 1.9) → 크기 문제 시 weld.
- [pipeline] world.json의 `files.materials/rail/map`은 아직 없는 파일을 가리킨다(스키마 필수 필드) → 각 태스크(M03/M07/M08)에서 생성.
- [pipeline] HLOD: 2020(L2/L3) vs 2025(L0/L1) 원천 차이로 원경 전환 시 일부 건물 등장·소멸 가능. 항공사진 지면색(04 §4.5 L2)·나무 임포스터는 M03/M04. 2020 원천 용도 코드가 대부분 null → 야간 점등 단계 기본 6.
- [tools] `pnpm pipeline`은 `normalize`·`build`·`validate` 구현. terrain normalize·build는 GDAL 필요 → 컨테이너 전용. 재현성(gzip=zlib 버전)은 컨테이너 기준.
- [geo] 골든 재생성 `--check`는 pyproj가 필요해 CI 미포함 → 파이프라인 CI(M01-T05 이후)에서 pyproj 설치 후 추가 검토.
- [geo] build가 world.json `crs`를 `WORLD_ORIGIN`에서 생성(validate로 확인), 게임 부트(`world-load.ts checkManifest`)도 `WORLD_ORIGIN`과 대조(M01-T07). 셀 전체 해시(hash32) 검사는 메인 스레드 예산 때문에 M02 디코드 워커로.
- [root] 외부 런타임 의존(three, jolt 등)은 아직 미설치 — 각 패키지 태스크에서 02 표 버전으로 정확 고정해 추가.

## Notes (M00-T03 조사 결과)
- **세션 종료 시 `pnpm codemap` 자동 실행 훅: 적용 안 함.** Claude Code `SessionEnd`는 clear/logout/입력 종료 등에서 발화하고 공유 1.5 s 예산·차단 불가. 클라우드 세션은 명시적 종료 없이 비활성 VM 회수로 끝나 발화가 보장되지 않고, 발화해도 결과가 커밋·푸시되지 않은 채 컨테이너와 함께 사라진다. 대안: `/handoff` 7단계(수동) + CI `records` 잡(커밋본 ≠ 재생성 결과면 실패)이 누락을 막는다. 필요 시 `Stop` 훅(턴마다 codemap 갱신, `stop_hook_active` 가드)을 별도 검토.
- 프리뷰 URL은 staging Worker의 버전(`pr-<N>` 별칭)이며 staging 바인딩을 공유한다.

## Decisions Pending
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [x] GitHub Environment `production` 생성 + Required reviewers 지정
- [x] workers.dev 서브도메인 등록 — staging: https://tokyo-sanpo-staging.kolom1357.workers.dev (`/api/health` 정상)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [x] 파이프라인 빌드 머신(16 GB+ RAM, Docker) — 로컬 Windows PC + Docker Desktop(16코어, 16 GB 할당)
- [x] 국토지리원 기반지도정보 DEM 다운로드(533935·533945, DEM1A/5A 2025-08-22)
