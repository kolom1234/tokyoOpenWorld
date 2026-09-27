# PROGRESS
Updated: 2026-09-28 (session #11 — M01-T06 완료, PR 리뷰·사람 육안 확인 대기)

## Current Milestone: M01 — Geo & First Cell (T01–T07 전부 구현 · T06 PR 병합 + 육안 확인 대기)
## Current Task: M01-T06 Minimal render & free camera (done — PR 리뷰 대기)
- Done in this task: `@sanpo/render`(WebGPURenderer 초기화 + WebGL2 폴백, **reversed-Z** — ADR-0006 Accepted, 방향광 1개 + 반구광, 씬 그래프, DecodedMesh→Mesh, 원점 재설정 2048 m/256 m 격자), `@sanpo/input`(키보드·마우스·Pointer Lock/드래그, 컨텍스트, phase 0 스냅샷), `@sanpo/traversal`(FSM + freecam만, physics 없음), apps/game `world-view.ts`·`start-view.ts`·`wiring/camera.ts`·`debug/{local-cells,overlay}.ts`, `?backend=webgl`, e2e `render.spec.ts`(WebGL2/SwiftShader 스크린샷·건물 픽셀·원점 재설정 왕복 픽셀 차 0), ADR-0020(DecodedMesh 속성 규약)
- In progress: –
- **임시 코드(삭제 예정)**: `apps/game/src/debug/local-cells.ts`(메인 스레드 glb 파싱 + `LocalGround`) → **M02-T05에서 삭제**(roadmap M02-T05 블록에 기록). `LoadedCell.tkc`·`world-view.ts showWorld`도 그때 streaming 배선으로 교체.
- Next step (정확히 한 걸음): PR 병합 + 사람 육안 확인(PR 본문 체크리스트: 실제 GPU WebGPU, 조작, Scramble Square ≈ 230 m, O 키 원점 재설정 떨림 없음) → `/sanpo-resume M02-T01`(`### M02-T01` 블록 + `docs/modules/streaming.md`부터)
- Blockers: 없음 (WebGPU 백엔드 실동작은 GPU 있는 사람 환경에서만 확인 가능 — 클라우드 세션은 WebGL2/SwiftShader만 검증)

## Recently Completed
- M01-T06 Minimal render & free camera — three 0.186.1 `WebGPURenderer`(`reversedDepthBuffer` — WebGPU depth32float, WebGL2는 `EXT_clip_control` 필요·SwiftShader에 있음, 없으면 logarithmic; `backend-caps.ts` 사전 판정), AgX, 방향광(방위 200°·고도 50°) + 반구광, 단색 PBR 2종(`terrain_ground`·`facade_default`). 원점 재설정: 카메라 ≥ 2048 m → 256 m 격자 스냅, 같은 renderPrep에서 노드·카메라 재계산(누적 없음). freecam: 관성 감쇠 3/s, 휠 0.5–60 m/s(×1.25/노치), Shift ×4, E/Q, 고도 ≤ 1,000 m, 지면 + 1 m. 시작: WF(−60, 지면+60, −15) → Scramble Square(지붕 TP 245.6 m, 지면 대비 ≈ 231 m). `?debug=1` 오버레이 + O 키(+4096 m → 1 s → 복귀). headless Chromium(SwiftShader WebGL2): 셀 4·draw 9·tris 230k·≈ 7 FPS, 원점 재설정 2회 왕복 전후 픽셀 차 0. 테스트 +7파일/+31건, e2e +2 (2026-09-28)
- M01-T07 Test fixture world — `tests/fixtures/world-mini`(L0_-1..0 × -1..0, 셀 484–903 KiB, 건물 412동, validate 0 오류·이웃 4쌍 1028 샘플 비트 일치, ATTRIBUTION) + `plateau-mini`(CityGML 건물 5동·도로 3개 원문 발췌 + DEM 1셀 창 + `expected.json` 스냅샷), 합계 3.38 MB. `pipeline fixture`(`stages/fixture{,-plateau}.ts`, 컨테이너), `fixtures.test.ts`(호스트 Windows = 컨테이너 스냅샷 일치). 게임 `?world=mini` → `world-load.ts`(world.json 원점·포맷 검증 → cells.idx → 스폰 ± 1 셀 헤더), Vite 플러그인(dev 서빙·build 복사, production `SANPO_WORLD_MINI=0`), Playwright 1.63.0 `tests/e2e/boot.spec.ts` + CI `e2e` 잡. `.gitignore` 예외 확인(`*.tkc` → `!tests/fixtures/**`), `.gitattributes` 바이너리·GML 보존, Biome 픽스처 제외. ADR-0019 (2026-09-28)
- M01-T05 Minimal cell build — `stages/build/{dem-window,heightfield,terrain-rtin,terrain-mesh,buildings-mesh,manifest,assemble}.ts`, `stages/validate{,-seams}.ts`, `lib/{gltf,triangulate}.ts`, `cli build|validate`, `scripts/repro-build.sh`. tile-format `HEIGHTFIELD_BASE_M = −100`(모든 셀 공통 minH), 지형 = **RTIN 정확 오차 ≤ 5 cm**(meshopt simplify는 실측 최대 0.64 m·경계 조각·접힘으로 교체), ADR-0018. 3×3(L0_-2..0_-1..1): 셀 484–903 KiB(≤ 4 MB), 건물 1082동, 이웃 12쌍 경계(높이장 3084 샘플 + 메시 3084 정점) 비트 일치, 컨테이너 2회 빌드 11파일 sha256 동일, validate 0 오류(ajv: world·헤더·meta). `world.schema` `$ref` 수정. 테스트 +3파일/+17건 (2026-09-28)
- M01-T04 @sanpo/tile-format — `writeTkc/readTkc/verifyTkc`(고정 키 순서 헤더, type 사전순, 16 B 정렬, 고정점 레이아웃), `SECTION_REGISTRY`(05 §4, 코덱·허용 레벨), `writeCellsIndex/readCellsIndex/tkcHash32`, `writeJcol/parseJcol`, `writeLanes/parseLanes`(SoA, fromNode/toNode = 노드 인덱스), `writeHeightfield/parseHeightfield/quantizeHeightfield`, `gzip/gunzip`(OS 바이트 0xFF 정규화), XXH64(u32 hi/lo, python-xxhash 골든 15개). 리더는 전부 `Result<_, TkcError>`(truncated/magic/version/flags/header/range/align/corrupt). 테스트 4파일/51건(합성 픽스처): round-trip 바이트 동일, 잘못된 매직/버전/flags, 범위 밖·겹침 오프셋, 정렬 위반, 미지 섹션 무시, ajv(cell-header·cell-meta). ADR-0017, apps/game `WORLD_FORMAT_VERSION` → `FORMAT_VERSION` (2026-09-28)
- M01-T03 DEM → terrain normalize — `readers/dem.ts`(FGD DEM xml, zip 멤버 스트림), `stages/normalize-terrain.ts`, `lib/raster.ts`, `checks/terrain-gsi.ts`, `cli normalize --layer terrain`. MVP 구역 전체(WF x ±1792, z −4352..1024) → `data/normalized/terrain/dem_1m.tif` 3585×5377 px(EPSG:6677, 픽셀 중심 = 정수 PRJ = 정수 WF), 컨테이너 43 s, 2회 바이트 동일. **결측**: DEM1A 원천 24타일 20.25 M점 중 データなし 140,756(0.69%), 출력 격자 19,276,545 px 중 1A 결측 23,271 px(**0.121%**) → **DEM5A로 23,271 px(100%, 전체의 0.121%) 채움, 보간 0 px**. **수락**: 스크램블 교차로 5점 GSI 표시값(1m レーザ) 대비 −0.01~−0.02 m(±0.5 m 통과), 참고 4점도 −0.02 m. GDAL↔@sanpo/geo 투영 차 < 1 mm. lock `gsi-dem`(파일별 sha256 맵, dataDate 2025-08-22) (2026-09-28)
- M01-T02 PLATEAU reader spike → ADR-0007 **B안(saxes SAX) 채택**. `tools/pipeline/Dockerfile`(Node 24.21.0 + GDAL 3.13.3 + nusamai 0.1.19, sha256 고정) + `docker/run.sh`(node_modules 볼륨·`--install`). 리더 `readers/plateau/*`(A안 nusamai는 비교용 유지), `stages/normalize-plateau.ts`, `lib/{polygon,ndjson-gz}.ts`, `cli.ts normalize`, geo `jisMesh3Of/jisMesh3CodesInBBox`. 스크램블 3×3 셀: 건물 1082동(최고 13113-bldg-375 measuredHeight 220 m, L0_0_0)·도로 조각 28,926 → `data/normalized/{buildings,roads}/*.ndjson.gz` 9+9 파일, 2회 실행 바이트 동일. A안은 면 종류·LOD3 도로 기능·UV 소실, B안 1.4–2.1× 빠름. lock `plateau-shibuya` 2025 채움, `.gitattributes`(eol=lf), ADR-0014 보정(node tsconfig에 DOM lib) (2026-09-27)
- M01-T01 @sanpo/geo — proj4 2.22.0 고정, `internal/{crs-defs,transforms,cells,convergence,bbox}.ts`, pyproj 골든 20점(`tools/pipeline/scripts/golden-geo.py` → `packages/geo/test/golden.json`, pyproj 3.7.2/PROJ 9.5.1). 골든 대비 최대 오차 ≈ 3 nm(< 1 mm), 스크램블(35.6595, 139.70055) → WF (−22.290, ·, 8.567) ≈ (−22.3, ·, 8.6) 확인. 테스트 3파일/99건 (2026-09-27)
- M00-T04 Boot skeleton — `apps/game` Vite 8.3.1 빌드(placeholder 삭제), `public/_headers`(정적 에셋 COOP/COEP/CORP/CSP·캐시), caps/boot/loop/world-status/status-view, `?debug=1` stats-gl, dev 프록시. Worker `/api/world/current`(KV)·`/world/*`(캐시→R2 Range·조건부·HEAD), validate/cache 분리, `env.local` + `seed:local`(ADR-0016). smoke.sh가 `/` 격리 헤더 검사. 로컬 검증: Chromium에서 crossOriginIsolated=true·WebGPU 감지·로컬 R2 fetch(200/206/304) (2026-09-27)
- M00-T03 CI & codemap — `tools/codemap`(TS 컴파일러 API, 결정론 출력, `--check`), `scripts/check-{size,asset-size,records}.ts`, `.github/workflows/{ci,preview,deploy}.yml` + `actions/setup` + `scripts/smoke.sh`, PR 템플릿, 최소 Worker(바인딩 optional, `/api/health`), 게임 placeholder 빌드, core `createScheduler`/`supervise` 60줄 이하로 분할(동작 동일). ADR-0014(tsconfig.node.json + @types/node 22), ADR-0015(R2/KV 바인딩 optional) (2026-09-27)
- M00-T02 @sanpo/core — api.ts 공유 어휘 타입, events.ts EventMap, internal/{event-bus,logger,scheduler,rng,hash,result,cell-key,math,config,worker-supervisor}.ts, 테스트 7파일/46건. ADR-0012(hash32/rng 고정), ADR-0013(type-only 순환 허용, depcruise `no-circular` 수정) (2026-09-27)

## Known Issues
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05는 도로 메시 없음 → M03 도로 빌드 때 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → 이번엔 zip에서 필요한 것만 수동 해제(`data/raw/plateau-shibuya/extracted/`: udx/bldg·tran 4메시 + codelists + schemas). fetch 구현 시 lock sha256 검증 + `extracted/` 전체 해제.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유(3×3 ≈ 수십 MB) → MVP 전체 294셀 실행 전 셀별 임시 파일 스필 필요(M02).
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함). M01-T05 실측: 셀 밖 돌출 최대 68.2 m(L0_-1_0, 허용 256 m) → 유지. 발자국 기준 전환은 294셀 빌드에서 문제가 보이면.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] e2e = 부트·월드 로드(`boot.spec.ts`) + 렌더 스모크(`render.spec.ts`, WebGL2/SwiftShader 강제). WebGPU 경로는 CI에 GPU가 없어 미검증(사람 확인). 걷기·모드 전환은 M04 이후. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
- [e2e] 클라우드 세션 Chromium은 Playwright 번들 버전과 달라 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`로 실행. 실행 전 떠 있는 `vite preview`가 있으면 `reuseExistingServer`로 **옛 빌드**를 테스트하니 먼저 종료할 것.
- [render] 메인 스레드 예산: SwiftShader에서 `render` 시스템 ≈ 30 ms(> 4 ms 경고)는 CPU 래스터라서 — 실제 GPU 수치는 사람 확인·`pnpm perf`(M02~). 임시 로더의 glb 파싱(부트 1회, 4셀)도 Hard Rule 8 예외 → M02-T05에서 워커로.
- [game] 게임 번들(three 포함) ≈ 1.05 MB(gzip 300 KB) → Vite 500 kB 경고. 코드 분할은 M03(후처리·대기 추가 시) 재검토.
- [fixtures] world-mini·plateau-mini는 생성물 → 셀 포맷·빌드 코드 변경 시 `docker/run.sh node tools/pipeline/src/cli.ts fixture`로 재생성(`fixtures.test.ts`가 불일치를 알려 줌). plateau-mini 건물은 appearance 제거로 UV 없음, 도로는 normalize 테스트용(셀 빌드에 도로 섹션 없음).
- [game] 부트 상태 화면(src/status-view.ts)은 DOM 임시 구현 → @sanpo/ui(M08) 로딩 화면으로 대체.
- [worker] `/world/*` 엣지 캐시(`caches.default`)는 단위 테스트에서 생략됨(Node에 없음) → M02-T06 miniflare 테스트.
- [ci] Biome `noExcessiveLinesPerFunction`이 일부 함수(예: 객체 반환 팩토리)를 놓침 → `scripts/check-size.ts`가 정본(docs/15 §2).
- [tile-format] `props.inst`·`trees.inst`·`lights.bin`·`audio.json` 인코더/디코더 미구현(레지스트리·모델 타입만) → 해당 태스크(M04~)에서 추가. 헤더 gzip(flags bit0)은 v1 미지원(ADR-0017).
- [pipeline] validate 미구현 항목: 랜드마크 20곳 정확도 샘플, report.html(현재 report.json·report.md), world.json·셀 간 교차 검사 일부. 증분 캐시(`data/build/.cache`)도 미구현 → 매 빌드 전체 재생성(3×3 ≈ 5 s).
- [pipeline] terrain `_SURF`는 전부 7(plaza) 임시값 → M03 도로·녹지 분류. buildings.mesh는 면별 정점(weld 없음, 정점/삼각형 ≈ 1.9) → 크기 문제 시 weld.
- [pipeline] world.json의 `files.materials/rail/map`은 아직 없는 파일을 가리킨다(스키마 필수 필드) → 각 태스크(M03/M07/M08)에서 생성.
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
