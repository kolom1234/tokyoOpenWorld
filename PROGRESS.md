# PROGRESS
Updated: 2026-09-29 (session #15 — 큐 모드 M03 Rendering Realism I, 브랜치 `claude/m03-queue`, draft PR)

## Current Milestone: M03 — Rendering Realism I (진행 순서: T10 → T01 → T02 → T03 → T04 → T06 → T05 → T07 → T08 → T09)
## Current Task: M03 큐 진행 중
- Done in this session: M03-T10(골든뷰 인프라, 앞당김), M03-T01(머티리얼 라이브러리).
- In progress: –
- 골든뷰: `pnpm golden`(tests/golden/README.md) — core 4장 before = `docs/screenshots/M03/base/`. 태스크마다 `GOLDEN_SAVE=M03/<Tnn>`.
- 배포 상태: staging Worker `tokyo-sanpo-staging` = dev 버킷 빌드 `20260928-b2d1e36-7fb58d45`(이전 `20260928-7e215f4-7fb58d45` — 10/5 이후 gc 가능).
  staging 첫 로딩(GOLDEN_BOOT, 새 컨텍스트) **59.8 MB**·첫 표시 6.9 s(M03 시작 기준).
- 로컬 빌드 `20260928-b2d1e36-7fb58d45`에 shared/materials 설치됨(`materials --build-id`). staging 반영은 파이프라인 재빌드(T04/T06) 때 한 번에.
- Next step (정확히 한 걸음): M03-T02 대기·하늘(@takram/three-atmosphere 0.19.1 `/webgpu` 설치 → lighting/atmosphere.ts·env-probe.ts).
- Blockers: 없음

## Recently Completed
- M03-T01 Material library & texture arrays — ambientCG CC0 32종(`content/materials/library.json`: 아스팔트 3·보도 4·콘크리트 4·타일 벽 6·금속 3·미장 2·사이딩 2·ALC·벽돌·지붕 2·잔디 2·흙·자갈; 유리는 T05 절차),
  pipeline `materials`(`stages/materials/{library,fetch,encode,run}.ts`: zip sha256 lock(`ambientcg`, `--update-lock`) → ImageMagick 리사이즈·ORM 패킹 → toktx 4.4.2 KTX2 배열 → 캐시 `data/derived/materials/<hash>` → `--build-id` 설치) + validate(`validate-materials.ts`, `schemas/materials.schema.json`).
  크기: albedo 1024² ETC1S 6.3 MB · normal 512² UASTC 7.0 MB · ORM 512² UASTC 4.7 MB = **18.0 MB**(1024² 3장은 55.8 MB → ADR-0027). 인코딩 ≈ 2.5 min.
  render: `materials/library.ts`(자리표시 배열 → manifest 평균색 → KTX2 교체, 재컴파일 없음), `textured.ts`(지형 `_SURF` 그룹·월드 XZ, 파사드 건물 해시 벽 그룹·UV0), `loadMaterials(url)`·`stats().materials`, context/frame/service 분리.
  game: 첫 표시 뒤 `loadMaterials(world.json files.materials)`, `three`→`three/webgpu` alias, `/basis/*` 트랜스코더 서빙·복사, 오버레이 머티리얼 줄.
  **수락**: GPU 텍스처 메모리 **67.1 MB**(BC7, ≤ 400 MB), 적재 0.6–1.4 s, 모든 레이어 출처(ATTRIBUTION `ambientcg-<asset>` 32건, sources.lock sha256 32건 — 테스트가 대조). 첫 표시 전송에 머티리얼 0.08 MB(manifest)만 — 텍스처는 첫 표시 뒤.
  버그 2건 수정: 큰 float 시드 varying 보간 → 픽셀 노이즈(uint 결합으로), 1성분 정수 속성 WebGL2 타입 불일치(`_SURF`·`_BLDG` f32, `_FACADE` unorm8x4). e2e 5/5(WebGL2) 통과. 테스트 +2파일/+10건. ADR-0027 (2026-09-29)
- M03-T10 Golden views infrastructure(앞당김) — `tests/golden/views.json`(7뷰, core 4: 스크램블 지면 + 7 m·서신주쿠 초고층·요요기 상공 300 m·富ヶ谷 저층 주택가 L0 −4,−3 — 주택가는 셀 meta 스캔으로 선정: 건물 288동·중앙 9.6 m·p90 13.4 m),
  게임 `?view=<id>`(`debug/bookmarks.ts`: 절대/지면 + AGL 포즈, 뷰 중심 부팅 대기, fov, 스트리밍 큐 0·HLOD 페이드 0·추가 조건 1.5 s → `#app[data-golden=ready]`), `pnpm golden`(실제 GPU Chrome 2560×1440, DPR 1, PNG 원본 + 1920×1080 JPEG 저장, SSIM, 부팅 전송 MB).
  **수락**: RTX 3050 Laptop·Chrome headed, core 4장을 새 컨텍스트로 연속 2회 캡처 → SSIM **1.000 / 1.000 / 1.000 / 1.000**(≥ 0.99), 각 뷰 ready 5.4–5.7 s, 콘솔 오류 0.
  시각·날씨·시드는 저장만(sim 시계 M03-T03, 군중 M06). 부팅 전송: 로컬 dev 89.5 MB(번들 안 된 JS 포함 — 판정 제외), staging 59.8 MB. 테스트 +2파일/+9건 (2026-09-29)
- M02-T07 MVP area build & staging deploy — 최종 코드로 재빌드 `20260928-b2d1e36-7fb58d45`: L0 294셀 115 MB(82 s, 최대 903 KiB L0_-1_-1) + HLOD 177셀(67 s) → validate **오류 0**(이음새 553쌍, HLOD 예산·자식 그룹) →
  dev 버킷 473 파일 212 MB(32.8 s) + staging KV 포인터 → `wrangler deploy --env staging`(R2·KV 바인딩) → smoke(world.json·cells.idx 포함) ok → Worker HEAD 473/473 일치, 200 MISS→HIT·206·304·404.
  **수락(실제 GPU, 캐시 없는 새 프로필, API 부팅)**: 첫 표시 **6.4 s**(엣지 콜드)·4.8 s(엣지 웜) ≤ 12 s; 남서→북동 모서리 6.2 km 저공(40 m) 30 m/s(108 km/h) 비행 — 순간이동(whenReady 0.41 s) 뒤
  **스트리밍 정지 0회**(발밑 L0 비-live 표본 0/1250), 프레임 p50 16.67·p99 16.85 ms(> 33 ms 2–3회), 실패 0, 해제 121, JS 힙 445 MB, 적용 최대 3.0 ms, 재계산 최대 2.8 ms.
  (첫 측정은 whenReady 없이 스폰→시작점 1.7 km를 즉시 이동해 0.68 s "정지" 1회 — 순간이동 경로라 제외, 재측정.) validate 경고 = 오류 0.
  스크린샷 `docs/screenshots/M02-T07-staging-{boot,flight-1..4}.png`. `smoke.sh` 월드 확인 추가 (2026-09-29)
- M02-T06 Worker routes & publish — Cloudflare 리소스 생성(wrangler, apac): R2 `sanpo-world-prod`·`sanpo-world-dev`, KV `SANPO_CONFIG`(938aa34b…)·`SANPO_CONFIG_STAGING`(52e1d2e4…) → wrangler.jsonc 바인딩(prod/staging).
  Worker: `/world/*` 엣지 캐시 = 평범한 GET만(Range·조건부는 R2 직접) + `X-Sanpo-Cache`, `/api/weather`(LIVE_WEATHER, Open-Meteo → 최소 필드, 10분 캐시).
  pipeline `publish`/`gc`(`stages/publish/{publish,uploaders,targets}.ts`, `lib/sigv4.ts`): 업로더 s3(SigV4 — AWS 테스트 벡터 일치, 64 MiB 초과 멀티파트, HEAD 검증) / api(Cloudflare REST, 기존 API 토큰),
  동시성 16·재시도 3, manifest.json, KV `CURRENT_BUILD`/`BUILDS`/`BUILD_FILES`, `--verify-only --verify-url`(Worker HEAD 전수), gc(현재 + 직전 + 7일).
  **수락**: 로컬 miniflare(`test/miniflare.test.ts`, 실제 `wrangler dev --env local`) current·200 MISS→HIT·206·304·HEAD·404·400 통과;
  **실제 dev 버킷**: MVP 473 파일 212 MB 업로드 38.7 s → `wrangler dev --env staging --remote`로 current 200·셀 200(MISS→HIT)·Range 206·If-None-Match 304·404·400, HEAD 크기 473/473 일치.
  테스트 +3파일/+14건. ADR-0026 (2026-09-29)
- M02-T05 Render cell adapter & HLOD switching — render: `hlod.mesh` → 셀당 draw 2(`_CHILD` u8 → f32 `_child`), HLOD 머티리얼(TSL per-object uniform vec4 × 4 페이드, 원-핫 선택,
  alphaHash 디더, 페이드 0 = 정점 붕괴), `scene/hlod-switch.ts`(숨김 0.3 s·보임 즉시·부모 도착 전 상태 보관), `setHlodChildVisible`·`precompile()`(기본+HLOD compileAsync)·stats.
  game: `wiring/streaming-render.ts`(phase 45 관심점, phase 55 적용 = 2 ms + 업로드 4 MiB/프레임·첫 셀 보장, ack, 부모 숨김/표시 순서), `world-view.showWorld` = precompile → createStreaming(워커)
  → whenReady(스폰 384 m) → 시작 시점, **임시 로더 `debug/local-cells.ts` 삭제**, `world-load`는 world.json·cells.idx만, 오버레이 스트리밍 줄, dev 전용 `?world=local`(`/local-world` → data/build).
  **수락(실제 GPU, 로컬 MVP 빌드)**: 신주쿠 서쪽 400 m → 2 m 급강하(8 s): 0.5 s 간격 19 샘플 지평선 아래 구멍(하늘색) 화소 0, 오류 0, 60 FPS, draw 63–74·2.1–2.35M tris,
  L0 9(> 300 m, 3×3) → 23 → 16(지상). 스크린샷 `docs/screenshots/M02-T05-shinjuku-{400m,dive-327m,dive-177m,dive-52m,ground}.png`.
  55 s 저공 비행(60 m/s): rAF 간격 p50 16.67·p99 16.85·최대 18.3 ms(> 33 ms 0), render p99 5.7 ms(> 4 ms 48프레임 — 셀 업로드), 적용 최대 3.1–4.5 ms, streaming 최대 0.55 ms.
  부팅(스크램블) 첫 표시 2.9 s. 테스트 +3파일/+10건, e2e 5 통과(WebGL2 폴백 포함). ADR-0025 (2026-09-29)
- M02-T04 HLOD pipeline — `stages/hlod/{far-buildings,tokyo23-lod1(+worker),dem-far,child-split,boxes,l1,l2,l3,run}.ts`, `validate-hlod.ts`, `lib/{geom2d,png}.ts`,
  CLI `hlod-prep`(23구 2020 zip 5.3 GB를 풀지 않고 `unzip -p` 스트림·워커 14개 → 원경 건물 **1,767,804동 / L2 57셀, 543 s**; 標高タイル dem_png z14 676장 → WF 8 m 원경 DEM 26 s)·`hlod`(73 s).
  L1 = 영역 L0 부모 24셀(L0 정규화 건물 용접 + meshopt simplify 25%·절대 2 m, dem_1m 4 m; 영역 밖 자식 = 원경 박스), L2 = OBB 박스(≥ 20 m·≥ 1000 m², ≤ 12k) + 64 m 블록 매스,
  L3 = 128 m 매스 + ≥ 80 m 박스, 자식 지형 = 65² RTIN + 스커트, **`hlod.mesh` = 머티리얼별 프리미티브 + `_CHILD` u8**(05 §4 변경: 셀당 draw 2), 야간 `_FACADE.flags`.
  **수락(MVP 실빌드 20260928-7e215f4-7fb58d45)**: L1 최대 2.42 MiB ≤ 3 MB, L2 최대 1.82 MiB·L3 최대 1.39 MiB ≤ 2 MB(재시도 0), 모든 정점 `_CHILD` ∈ 0..15·지형 자식 16/16·stats 일치 → validate 오류 0(L0 294셀·이음새 553쌍 포함).
  데이터: PLATEAU 신주쿠·메구로 2025(pref 판 = 3차 메시 단위 → 시부야 zip에 없는 5메시만), 23구 2020, `gsi-dem-tiles` → lock·03·ATTRIBUTION. normalize 다중 소스(같은 메시 파일 1회, 이전엔 덮어씀) → MVP 294셀 건물 44,292·도로 조각 269,140.
  테스트 +1파일/+9건(pipeline 53). ADR-0024 (2026-09-29)
- M02-T03 Lifecycle, ack, eviction, ground — `createStreaming`(service·planner·lifecycle·ground·waiters·cell-cache·cache-lru). 재계산 = L0 셀·모드·티어 변화 즉시 + 250 ms,
  진행 중 요청은 해제 반경 밖에서만 취소, 해제는 프레임당 ≤ 8(실행 직전 `inLoadZone` 재확인), onReady ≤ 2/프레임·render ack → live,
  failed → 60 s 뒤 재요청(기록 정리), whenReady = 영역 셀 pin + live|failed면 resolve, Cache Storage 1.5 GB LRU(세션 간 = 저장 순서 근사, 부팅 seed 백그라운드).
  **수락(10분 무작위 이동 헤드리스, 가상 시계)**: 기본 한도 — 텔레포트 12·fetch 1679·주입 실패 29·해제 1515, 로드 반경 안 해제 0·이중 전달 0·한도 초과 0 ms;
  좁은 한도(L0 24·L1 30·L2 30) — 최대 480 ms 안 수렴; 둘 다 관심점 제거 후 L3 16개만 live·진행/보류/failed/지면/타이머 0(누수 0).
  **셀 집합 계산 비용**(T01 이월): 재계산(computeDesired + rankCells + 해제 계획) 평균 0.41 ms, 워밍업 후 최대 ≈ 2 ms, 첫 호출 ≈ 8 ms(JIT 냉간·부팅 중).
  테스트 +6파일/+23건(streaming 88). ADR-0023, 06 §2·§6·§7·§9 갱신 (2026-09-29)
- M01-T06 사람 육안 확인(실제 GPU) — 이 PC(RTX 3050 Laptop 4 GB, 드라이버 537.13, Chrome 153 headed, Playwright `channel: 'chrome'`)에서
  `?world=mini&debug=1`: **백엔드 WebGPU · 깊이 reversed-z**, 어댑터 nvidia/ampere, **60 FPS 고정(16.7 ms, vsync)**, 셀 4·draw 9·tris 230k.
  **O 키 원점 재설정**: 원점 (0,0,0) → (4096,0,0) → (0,0,0), 재설정 2회, 복귀 후 카메라 WF 동일, 3D 영역 **픽셀 차 0**(떨림 없음).
  첫 프레임 `render` 53.6 ms 경고 1회(파이프라인 컴파일 — 선컴파일은 M02-T05/M03). 스크린샷 `docs/screenshots/M01-T06-start-webgpu-rtx3050.png` (2026-09-29)
- M02-T02 Fetcher & decode workers — 워커 디코드 결과가 파이프라인(gltf-transform) 스냅샷과 정점·인덱스 수·속성 레이아웃·내용 해시까지 일치(Node·worker_threads·Chromium). Chromium 모듈 워커(워커 2) 셀당 25–111 ms(1차)/25–76 ms(캐시 2차), 4셀 동시 84–153 ms, 메인 `decode()` 동기 구간 중앙값 ≈ 0.1 ms·긴 작업 0. 취소: 풀 즉시 aborted + 워커는 다음 단계 경계에서 중단(`cancelled`, 실제 스레드 테스트). 테스트 +6파일/+29건(총 383), e2e +1(`decode.spec.ts`). ADR-0022 (2026-09-28)
- M02-T01 Interest & priority — 06 §3–4 순수 함수. 한 점 기준(셀 내 위치 샘플) 원하는 L0 셀 수: 도보 11–16(해제 16–22), 자전거 16–21, 차량 27–32(42–48), 열차 39–45(57–65, 진행 방향 가중 시 ≈ 35), freecam 고도 0/100/300 m = R0 384/434/534, 300 m 초과 3×3(유지 5×5, 300–375 m는 원형 유지). L1 3 km(고고도 ≤ 3.5 km, 최대 상주 79–80 → 한도 80), L2 12 km, L3 전부. 부팅 순서 = 발밑 → L3 → L2 → L1 → 거리순. `computeDesired` 브루트포스 전수 대조 일치. ADR-0021 (2026-09-28)
- M01-T06 Minimal render & free camera — three 0.186.1 `WebGPURenderer`(`reversedDepthBuffer` — WebGPU depth32float, WebGL2는 `EXT_clip_control` 필요·SwiftShader에 있음, 없으면 logarithmic; `backend-caps.ts` 사전 판정), AgX, 방향광(방위 200°·고도 50°) + 반구광, 단색 PBR 2종(`terrain_ground`·`facade_default`). 원점 재설정: 카메라 ≥ 2048 m → 256 m 격자 스냅, 같은 renderPrep에서 노드·카메라 재계산(누적 없음). freecam: 관성 감쇠 3/s, 휠 0.5–60 m/s(×1.25/노치), Shift ×4, E/Q, 고도 ≤ 1,000 m, 지면 + 1 m. 시작: WF(−60, 지면+60, −15) → Scramble Square(지붕 TP 245.6 m, 지면 대비 ≈ 231 m). `?debug=1` 오버레이 + O 키(+4096 m → 1 s → 복귀). headless Chromium(SwiftShader WebGL2): 셀 4·draw 9·tris 230k·≈ 7 FPS, 원점 재설정 2회 왕복 전후 픽셀 차 0. 테스트 +7파일/+31건, e2e +2 (2026-09-28)
- M01-T07 Test fixture world — `tests/fixtures/world-mini`(L0_-1..0 × -1..0, 셀 484–903 KiB, 건물 412동, validate 0 오류·이웃 4쌍 1028 샘플 비트 일치, ATTRIBUTION) + `plateau-mini`(CityGML 건물 5동·도로 3개 원문 발췌 + DEM 1셀 창 + `expected.json` 스냅샷), 합계 3.38 MB. `pipeline fixture`(`stages/fixture{,-plateau}.ts`, 컨테이너), `fixtures.test.ts`(호스트 Windows = 컨테이너 스냅샷 일치). 게임 `?world=mini` → `world-load.ts`(world.json 원점·포맷 검증 → cells.idx → 스폰 ± 1 셀 헤더), Vite 플러그인(dev 서빙·build 복사, production `SANPO_WORLD_MINI=0`), Playwright 1.63.0 `tests/e2e/boot.spec.ts` + CI `e2e` 잡. `.gitignore` 예외 확인(`*.tkc` → `!tests/fixtures/**`), `.gitattributes` 바이너리·GML 보존, Biome 픽스처 제외. ADR-0019 (2026-09-28)

## Known Issues
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
