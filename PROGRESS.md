# PROGRESS
Updated: 2026-09-28 (session #8 — M01-T04 완료, PR 리뷰 대기)

## Current Milestone: M01 — Geo & First Cell (T01·T02·T03·T04 완료)
## Current Task: M01-T05 Minimal cell build (not started)
- Done in this task: –
- In progress: –
- Next step (정확히 한 걸음): M01-T04 PR 병합 확인 → `### M01-T05` 블록 + `docs/modules/tile-format.md`의 "M01-T05 사용 예"를 읽고 `tools/pipeline/src/stages/build/heightfield.ts`부터 작성(`dem_1m.tif` 257² 창 → `quantizeHeightfield` → `writeHeightfield` → `gzip`). GDAL 필요 단계는 컨테이너 전용이므로 클라우드 세션에선 합성 격자로 단위 테스트
- Blockers: 없음

## Recently Completed
- M01-T04 @sanpo/tile-format — `writeTkc/readTkc/verifyTkc`(고정 키 순서 헤더, type 사전순, 16 B 정렬, 고정점 레이아웃), `SECTION_REGISTRY`(05 §4, 코덱·허용 레벨), `writeCellsIndex/readCellsIndex/tkcHash32`, `writeJcol/parseJcol`, `writeLanes/parseLanes`(SoA, fromNode/toNode = 노드 인덱스), `writeHeightfield/parseHeightfield/quantizeHeightfield`, `gzip/gunzip`(OS 바이트 0xFF 정규화), XXH64(u32 hi/lo, python-xxhash 골든 15개). 리더는 전부 `Result<_, TkcError>`(truncated/magic/version/flags/header/range/align/corrupt). 테스트 4파일/51건(합성 픽스처): round-trip 바이트 동일, 잘못된 매직/버전/flags, 범위 밖·겹침 오프셋, 정렬 위반, 미지 섹션 무시, ajv(cell-header·cell-meta). ADR-0017, apps/game `WORLD_FORMAT_VERSION` → `FORMAT_VERSION` (2026-09-28)
- M01-T03 DEM → terrain normalize — `readers/dem.ts`(FGD DEM xml, zip 멤버 스트림), `stages/normalize-terrain.ts`, `lib/raster.ts`, `checks/terrain-gsi.ts`, `cli normalize --layer terrain`. MVP 구역 전체(WF x ±1792, z −4352..1024) → `data/normalized/terrain/dem_1m.tif` 3585×5377 px(EPSG:6677, 픽셀 중심 = 정수 PRJ = 정수 WF), 컨테이너 43 s, 2회 바이트 동일. **결측**: DEM1A 원천 24타일 20.25 M점 중 データなし 140,756(0.69%), 출력 격자 19,276,545 px 중 1A 결측 23,271 px(**0.121%**) → **DEM5A로 23,271 px(100%, 전체의 0.121%) 채움, 보간 0 px**. **수락**: 스크램블 교차로 5점 GSI 표시값(1m レーザ) 대비 −0.01~−0.02 m(±0.5 m 통과), 참고 4점도 −0.02 m. GDAL↔@sanpo/geo 투영 차 < 1 mm. lock `gsi-dem`(파일별 sha256 맵, dataDate 2025-08-22) (2026-09-28)
- M01-T02 PLATEAU reader spike → ADR-0007 **B안(saxes SAX) 채택**. `tools/pipeline/Dockerfile`(Node 24.21.0 + GDAL 3.13.3 + nusamai 0.1.19, sha256 고정) + `docker/run.sh`(node_modules 볼륨·`--install`). 리더 `readers/plateau/*`(A안 nusamai는 비교용 유지), `stages/normalize-plateau.ts`, `lib/{polygon,ndjson-gz}.ts`, `cli.ts normalize`, geo `jisMesh3Of/jisMesh3CodesInBBox`. 스크램블 3×3 셀: 건물 1082동(최고 13113-bldg-375 measuredHeight 220 m, L0_0_0)·도로 조각 28,926 → `data/normalized/{buildings,roads}/*.ndjson.gz` 9+9 파일, 2회 실행 바이트 동일. A안은 면 종류·LOD3 도로 기능·UV 소실, B안 1.4–2.1× 빠름. lock `plateau-shibuya` 2025 채움, `.gitattributes`(eol=lf), ADR-0014 보정(node tsconfig에 DOM lib) (2026-09-27)
- M01-T01 @sanpo/geo — proj4 2.22.0 고정, `internal/{crs-defs,transforms,cells,convergence,bbox}.ts`, pyproj 골든 20점(`tools/pipeline/scripts/golden-geo.py` → `packages/geo/test/golden.json`, pyproj 3.7.2/PROJ 9.5.1). 골든 대비 최대 오차 ≈ 3 nm(< 1 mm), 스크램블(35.6595, 139.70055) → WF (−22.290, ·, 8.567) ≈ (−22.3, ·, 8.6) 확인. 테스트 3파일/99건 (2026-09-27)
- M00-T04 Boot skeleton — `apps/game` Vite 8.3.1 빌드(placeholder 삭제), `public/_headers`(정적 에셋 COOP/COEP/CORP/CSP·캐시), caps/boot/loop/world-status/status-view, `?debug=1` stats-gl, dev 프록시. Worker `/api/world/current`(KV)·`/world/*`(캐시→R2 Range·조건부·HEAD), validate/cache 분리, `env.local` + `seed:local`(ADR-0016). smoke.sh가 `/` 격리 헤더 검사. 로컬 검증: Chromium에서 crossOriginIsolated=true·WebGPU 감지·로컬 R2 fetch(200/206/304) (2026-09-27)
- M00-T03 CI & codemap — `tools/codemap`(TS 컴파일러 API, 결정론 출력, `--check`), `scripts/check-{size,asset-size,records}.ts`, `.github/workflows/{ci,preview,deploy}.yml` + `actions/setup` + `scripts/smoke.sh`, PR 템플릿, 최소 Worker(바인딩 optional, `/api/health`), 게임 placeholder 빌드, core `createScheduler`/`supervise` 60줄 이하로 분할(동작 동일). ADR-0014(tsconfig.node.json + @types/node 22), ADR-0015(R2/KV 바인딩 optional) (2026-09-27)
- M00-T02 @sanpo/core — api.ts 공유 어휘 타입, events.ts EventMap, internal/{event-bus,logger,scheduler,rng,hash,result,cell-key,math,config,worker-supervisor}.ts, 테스트 7파일/46건. ADR-0012(hash32/rng 고정), ADR-0013(type-only 순환 허용, depcruise `no-circular` 수정) (2026-09-27)
- M00-T01 모노레포 골격 — 11 packages + apps/{game,worker} + tools/{pipeline,codemap}, biome/tsc/depcruise/vitest 설정, ADR-0011(Node ≥22.12), `/resume`→`/sanpo-resume` 개명 (2026-09-27)
- 설계 문서 세트 v1 (CLAUDE.md, docs/00–17, docs/roadmap/M00–M11, docs/modules/*, docs/adr/0001–0010, schemas/*) — 2026-09-27

## Known Issues
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05 지형·도로 접합 시 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → 이번엔 zip에서 필요한 것만 수동 해제(`data/raw/plateau-shibuya/extracted/`: udx/bldg·tran 4메시 + codelists + schemas). fetch 구현 시 lock sha256 검증 + `extracted/` 전체 해제.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유(3×3 ≈ 수십 MB) → MVP 전체 294셀 실행 전 셀별 임시 파일 스필 필요(M01-T05 또는 M02).
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함) → 발자국(ground 면) 기준이 더 안정적. M01-T05에서 경계 건물 확인 후 결정.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] Playwright 스모크 미포함 → `ci.yml` check 잡 TODO 위치. 부트 화면의 `#app[data-isolated|data-webgpu|data-world]`를 검사 대상으로 쓰면 된다(M01-T07 world-mini 픽스처와 함께).
- [game] 부트 상태 화면(src/status-view.ts)은 DOM 임시 구현 → @sanpo/ui(M08) 로딩 화면으로 대체.
- [worker] `/world/*` 엣지 캐시(`caches.default`)는 단위 테스트에서 생략됨(Node에 없음) → M02-T06 miniflare 테스트.
- [ci] Biome `noExcessiveLinesPerFunction`이 일부 함수(예: 객체 반환 팩토리)를 놓침 → `scripts/check-size.ts`가 정본(docs/15 §2).
- [tile-format] `props.inst`·`trees.inst`·`lights.bin`·`audio.json` 인코더/디코더 미구현(레지스트리·모델 타입만) → 해당 태스크(M04~)에서 추가. 헤더 gzip(flags bit0)은 v1 미지원(ADR-0017).
- [pipeline] validate 단계(04 §4.6)의 스키마 검증은 `tools/pipeline`에 `ajv` 8.20.0 의존을 추가해야 함(현재 tile-format devDependency만).
- [tools] `pnpm pipeline`은 `normalize`(plateau·terrain)만 구현. terrain은 GDAL 필요 → 컨테이너 전용. 나머지 단계 M01-T04~.
- [geo] 골든 재생성 `--check`는 pyproj가 필요해 CI 미포함 → 파이프라인 CI(M01-T05 이후)에서 pyproj 설치 후 추가 검토.
- [geo] `WORLD_ORIGIN` ↔ `data/world.json` 부팅 검증은 world.json이 아직 없음 → M01-T05(셀 빌드)에서 생성·검증.
- [root] 외부 런타임 의존(three, jolt 등)은 아직 미설치 — 각 패키지 태스크에서 02 표 버전으로 정확 고정해 추가.

## Notes (M00-T03 조사 결과)
- **세션 종료 시 `pnpm codemap` 자동 실행 훅: 적용 안 함.** Claude Code `SessionEnd`는 clear/logout/입력 종료 등에서 발화하고 공유 1.5 s 예산·차단 불가. 클라우드 세션은 명시적 종료 없이 비활성 VM 회수로 끝나 발화가 보장되지 않고, 발화해도 결과가 커밋·푸시되지 않은 채 컨테이너와 함께 사라진다. 대안: `/handoff` 7단계(수동) + CI `records` 잡(커밋본 ≠ 재생성 결과면 실패)이 누락을 막는다. 필요 시 `Stop` 훅(턴마다 codemap 갱신, `stop_hook_active` 가드)을 별도 검토.
- 프리뷰 URL은 staging Worker의 버전(`pr-<N>` 별칭)이며 staging 바인딩을 공유한다.

## Decisions Pending
- ADR-0006 깊이 버퍼 전략 → M01-T06
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [x] GitHub Environment `production` 생성 + Required reviewers 지정
- [x] workers.dev 서브도메인 등록 — staging: https://tokyo-sanpo-staging.kolom1357.workers.dev (`/api/health` 정상)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [x] 파이프라인 빌드 머신(16 GB+ RAM, Docker) — 로컬 Windows PC + Docker Desktop(16코어, 16 GB 할당)
- [x] 국토지리원 기반지도정보 DEM 다운로드(533935·533945, DEM1A/5A 2025-08-22)
