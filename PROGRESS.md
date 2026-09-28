# PROGRESS
Updated: 2026-09-29 (session #14 — 큐 모드: M01-T06 GPU 확인 + M02-T03·T04 완료, 브랜치 `claude/m02-queue`, draft PR #14)

## Current Milestone: M02 — Streaming & Deploy (T01–T04 완료 · T05–T07 남음)
## Current Task: M02-T05 Render cell adapter & HLOD switching (다음)
- Done in this session: M01-T06 실제 GPU 육안 확인, M02-T03, M02-T04(아래 Recently Completed).
- In progress: –
- **임시 코드(삭제 예정)**: `apps/game/src/debug/local-cells.ts`(메인 스레드 glb 파싱 + `LocalGround`) → **M02-T05에서 삭제**. 교체 = `createStreaming`
  (`onReady` payload·`groundHeightAt`, ADR-0023). `LoadedCell.tkc`·`world-view.ts showWorld`도 그때 streaming 배선으로.
- 로컬 빌드(커밋 안 됨, data/build): `20260928-7e215f4-7fb58d45` = MVP L0 294 + L1 24 + L2 144 + L3 9, validate 오류 0. T05 화면 확인·T07 publish에 재사용 가능(코드가 바뀌면 재빌드).
- Next step (정확히 한 걸음): `### M02-T05` 블록 + 07 §2–3·06 §5·01 §4 읽고 render `hlod.mesh`(`_CHILD` + 셀별 uniform 16개 페이드, ADR-0024) → `apps/game/src/wiring/streaming-render.ts`.
- Blockers: 없음

## Recently Completed
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
- M01-T05 Minimal cell build — `stages/build/{dem-window,heightfield,terrain-rtin,terrain-mesh,buildings-mesh,manifest,assemble}.ts`, `stages/validate{,-seams}.ts`, `lib/{gltf,triangulate}.ts`, `cli build|validate`, `scripts/repro-build.sh`. tile-format `HEIGHTFIELD_BASE_M = −100`(모든 셀 공통 minH), 지형 = **RTIN 정확 오차 ≤ 5 cm**(meshopt simplify는 실측 최대 0.64 m·경계 조각·접힘으로 교체), ADR-0018. 3×3(L0_-2..0_-1..1): 셀 484–903 KiB(≤ 4 MB), 건물 1082동, 이웃 12쌍 경계(높이장 3084 샘플 + 메시 3084 정점) 비트 일치, 컨테이너 2회 빌드 11파일 sha256 동일, validate 0 오류(ajv: world·헤더·meta). `world.schema` `$ref` 수정. 테스트 +3파일/+17건 (2026-09-28)
- M01-T04 @sanpo/tile-format — `writeTkc/readTkc/verifyTkc`(고정 키 순서 헤더, type 사전순, 16 B 정렬, 고정점 레이아웃), `SECTION_REGISTRY`(05 §4, 코덱·허용 레벨), `writeCellsIndex/readCellsIndex/tkcHash32`, `writeJcol/parseJcol`, `writeLanes/parseLanes`(SoA, fromNode/toNode = 노드 인덱스), `writeHeightfield/parseHeightfield/quantizeHeightfield`, `gzip/gunzip`(OS 바이트 0xFF 정규화), XXH64(u32 hi/lo, python-xxhash 골든 15개). 리더는 전부 `Result<_, TkcError>`(truncated/magic/version/flags/header/range/align/corrupt). 테스트 4파일/51건(합성 픽스처): round-trip 바이트 동일, 잘못된 매직/버전/flags, 범위 밖·겹침 오프셋, 정렬 위반, 미지 섹션 무시, ajv(cell-header·cell-meta). ADR-0017, apps/game `WORLD_FORMAT_VERSION` → `FORMAT_VERSION` (2026-09-28)
- M01-T03 DEM → terrain normalize — `readers/dem.ts`(FGD DEM xml, zip 멤버 스트림), `stages/normalize-terrain.ts`, `lib/raster.ts`, `checks/terrain-gsi.ts`, `cli normalize --layer terrain`. MVP 구역 전체(WF x ±1792, z −4352..1024) → `data/normalized/terrain/dem_1m.tif` 3585×5377 px(EPSG:6677, 픽셀 중심 = 정수 PRJ = 정수 WF), 컨테이너 43 s, 2회 바이트 동일. **결측**: DEM1A 원천 24타일 20.25 M점 중 データなし 140,756(0.69%), 출력 격자 19,276,545 px 중 1A 결측 23,271 px(**0.121%**) → **DEM5A로 23,271 px(100%, 전체의 0.121%) 채움, 보간 0 px**. **수락**: 스크램블 교차로 5점 GSI 표시값(1m レーザ) 대비 −0.01~−0.02 m(±0.5 m 통과), 참고 4점도 −0.02 m. GDAL↔@sanpo/geo 투영 차 < 1 mm. lock `gsi-dem`(파일별 sha256 맵, dataDate 2025-08-22) (2026-09-28)
- M01-T02 PLATEAU reader spike → ADR-0007 **B안(saxes SAX) 채택**. `tools/pipeline/Dockerfile`(Node 24.21.0 + GDAL 3.13.3 + nusamai 0.1.19, sha256 고정) + `docker/run.sh`(node_modules 볼륨·`--install`). 리더 `readers/plateau/*`(A안 nusamai는 비교용 유지), `stages/normalize-plateau.ts`, `lib/{polygon,ndjson-gz}.ts`, `cli.ts normalize`, geo `jisMesh3Of/jisMesh3CodesInBBox`. 스크램블 3×3 셀: 건물 1082동(최고 13113-bldg-375 measuredHeight 220 m, L0_0_0)·도로 조각 28,926 → `data/normalized/{buildings,roads}/*.ndjson.gz` 9+9 파일, 2회 실행 바이트 동일. A안은 면 종류·LOD3 도로 기능·UV 소실, B안 1.4–2.1× 빠름. lock `plateau-shibuya` 2025 채움, `.gitattributes`(eol=lf), ADR-0014 보정(node tsconfig에 DOM lib) (2026-09-27)
- M01-T01 @sanpo/geo — proj4 2.22.0 고정, `internal/{crs-defs,transforms,cells,convergence,bbox}.ts`, pyproj 골든 20점(`tools/pipeline/scripts/golden-geo.py` → `packages/geo/test/golden.json`, pyproj 3.7.2/PROJ 9.5.1). 골든 대비 최대 오차 ≈ 3 nm(< 1 mm), 스크램블(35.6595, 139.70055) → WF (−22.290, ·, 8.567) ≈ (−22.3, ·, 8.6) 확인. 테스트 3파일/99건 (2026-09-27)
- M00-T04 Boot skeleton — `apps/game` Vite 8.3.1 빌드(placeholder 삭제), `public/_headers`(정적 에셋 COOP/COEP/CORP/CSP·캐시), caps/boot/loop/world-status/status-view, `?debug=1` stats-gl, dev 프록시. Worker `/api/world/current`(KV)·`/world/*`(캐시→R2 Range·조건부·HEAD), validate/cache 분리, `env.local` + `seed:local`(ADR-0016). smoke.sh가 `/` 격리 헤더 검사. 로컬 검증: Chromium에서 crossOriginIsolated=true·WebGPU 감지·로컬 R2 fetch(200/206/304) (2026-09-27)

## Known Issues
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05는 도로 메시 없음 → M03 도로 빌드 때 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → zip에서 필요한 것만 수동 해제(`data/raw/plateau-{shibuya,shinjuku,meguro}/extracted/`: MVP 24메시 udx/bldg·tran + codelists + schemas, 2026-09-29). 23구 zip은 풀지 않음(hlod-prep 스트림). 標高タイル은 hlod-prep이 받음. fetch 구현 시 lock sha256 검증.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유 → MVP 294셀은 `NODE_OPTIONS=--max-old-space-size=12288`로 통과(2026-09-29). 23구 전체 L0로 넓힐 때 셀별 스필 필요.
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함). M01-T05 실측: 셀 밖 돌출 최대 68.2 m(L0_-1_0, 허용 256 m) → 유지. 발자국 기준 전환은 294셀 빌드에서 문제가 보이면.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] e2e = 부트·월드 로드(`boot.spec.ts`) + 렌더 스모크(`render.spec.ts`, WebGL2/SwiftShader 강제) + 디코드 워커(`decode.spec.ts`, `?probe=decode`). WebGPU 경로는 CI에 GPU가 없어 미검증 → 로컬 실제 GPU(Chrome headed, `channel: 'chrome'`)로 확인(2026-09-29). 걷기·모드 전환은 M04 이후. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
- [e2e] 클라우드 세션 Chromium은 Playwright 번들 버전과 달라 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`로 실행. 실행 전 떠 있는 `vite preview`가 있으면 `reuseExistingServer`로 **옛 빌드**를 테스트하니 먼저 종료할 것.
- [render] 메인 스레드 예산: SwiftShader에서 `render` 시스템 ≈ 30 ms는 CPU 래스터라서. 실제 GPU(RTX 3050)에선 60 FPS 고정, 첫 프레임만 53.6 ms(셰이더·파이프라인 컴파일) → `compileAsync` 선컴파일(06 §6). 임시 로더의 glb 파싱(부트 1회, 4셀)도 Hard Rule 8 예외 → M02-T05에서 워커로.
- [game] 게임 번들(three 포함) ≈ 1.05 MB(gzip 300 KB) → Vite 500 kB 경고. 코드 분할은 M03(후처리·대기 추가 시) 재검토.
- [fixtures] world-mini·plateau-mini는 생성물 → 셀 포맷·빌드 코드 변경 시 `docker/run.sh node tools/pipeline/src/cli.ts fixture`로 재생성(`fixtures.test.ts`가 불일치를 알려 줌). plateau-mini 건물은 appearance 제거로 UV 없음, 도로는 normalize 테스트용(셀 빌드에 도로 섹션 없음).
- [game] 부트 상태 화면(src/status-view.ts)은 DOM 임시 구현 → @sanpo/ui(M08) 로딩 화면으로 대체.
- [streaming] 워커 사망 시 진행 중 작업은 `worker` 오류 → lifecycle `failed` → 60 s 뒤 재요청(더 빨리 재시도할지는 T07 실측 후). 워커가 'failed'(재시작 포기)면 풀이 다음 호출/메시지 때 sweep으로 정리.
- [streaming] Cache Storage 세션 간 LRU는 저장 순서(FIFO) 근사, 기존 항목 크기는 Content-Length(없으면 1 MiB 가정) — ADR-0023. 브라우저에서 seed 시간 미측정(M02-T05/T07).
- [streaming] 디코드 시간은 클라우드 컨테이너 headless Chromium 값(ADR-0022). 실제 데스크톱 수치는 `?world=mini&probe=decode` → 콘솔 `__SANPO_DECODE_PROBE__`로 확인. e2e는 병렬 SwiftShader 테스트와 CPU 경합 → `postMs`는 중앙값으로 판정.
- [streaming] 재계산은 Node 실측 평균 0.41 ms(ADR-0023). 첫 호출 ≈ 8 ms(JIT) → 부팅 로딩 중이라 허용, 브라우저 수치는 `pnpm perf`(M02-T07~). 고고도 L1 +16셀 메모리는 M02-T04 HLOD 크기로 확인(ADR-0021).
- [worker] `/world/*` 엣지 캐시(`caches.default`)는 단위 테스트에서 생략됨(Node에 없음) → M02-T06 miniflare 테스트.
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
