# apps/game (Composition Root)
Layer: L5 | Depends: 모든 @sanpo 패키지 | Used by: apps/worker(정적 에셋으로 서빙)

## Purpose
브라우저 엔트리. 기능 감지 → 서비스 생성 → 패키지 간 배선 → 루프 실행. **게임 로직을 두지 않는다**(배선·설정·부트만).

## 부트 시퀀스 (src/boot.ts)
```
1. caps = detectCaps()                       // WebGPU, crossOriginIsolated, cores, detect-gpu 티어
2. log, bus, scheduler = core
3. cfg = mergeConfig(defaults, config/*.json, urlFlags)
4. { buildId, baseUrl } = GET /api/world/current?fv=FORMAT_VERSION (또는 `?world=mini` → /fixtures/world-mini, ADR-0019) → world.json 로드, geo 원점 검증 (구현: world-load.ts)
5. ui = mountUi(root, bridge)                // 로딩 화면 먼저
6. streaming = createStreaming(...)          // cells.idx
7. render = await createRender(...); physics = createPhysics(...); sim = createSim(...); audio = createAudio(...); input = createInput(...)
8. traversal = createTraversal({ physics, input, bus, ground: streaming, trains: () => sim.trainsNear(player, 300) })
9. wiring: streaming.onReady → render/sim/audio/traversal.interactables/ui(meta), 물리 반경 셀 → streaming.requestSections → physics.addCell, sim↔physics(MessageChannel), sim.outputs() → render.layers.*.bindShared, traversal 관심점 → streaming.setInterest, sim.environment() → render.setEnvironment/audio
   scheduler.setFrameSource({ camera: () => traversal.camera, player: () => traversal.player, gameTimeMs: () => sim.clock.gameTimeMs, timeScale: () => sim.clock.timeScale })
10. await streaming.whenReady({ centerWF: spawn.posWF, radius: 384, levels: [0,1,2,3] }) ; await physics.ready ; await render.precompile()
11. scheduler.add(각 서비스: SystemProvider) → loop.start()
```

## Files
| 파일 | 책임 |
|---|---|
| index.html, vite.config.ts | Vite 엔트리. `three` → `three/webgpu` alias(addon 중복 번들 방지) + `sanpo-basis-transcoder`(`/basis/*` = three examples/jsm/libs/basis, dev 서빙·build 복사) + dev 서버 격리 헤더 + `/api`·`/world` → `wrangler dev`(8787) 프록시 + `sanpo-world-mini` 플러그인(dev 서빙, build 시 `dist/fixtures/world-mini` 복사, `SANPO_WORLD_MINI=0`이면 생략) + `sanpo-local-build`(dev 전용 `/local-world` → `data/build/<SANPO_LOCAL_BUILD | 최신>`) |
| public/_headers | 정적 에셋 COOP/COEP/CORP/CSP·캐시 헤더(docs/13 §3) — Worker를 거치지 않는 응답용. `/basis/ktx2-worker.js`만 별도 CSP('unsafe-eval', ADR-0032) |
| vite.config.ts `sanpo-gpu-benchmarks` | detect-gpu 벤치마크 JSON → `/detect-gpu/*`(dev 서빙·build 복사) |
| public/basis/ktx2-worker.js | KTX2 트랜스코더 부트스트랩 워커(첫 메시지 본문을 전역 eval — render `materials/ktx2-csp.ts`와 짝) |
| src/main.ts | 엔트리, 오류 화면, `?probe=decode`면 부트 대신 `debug/decode-probe.ts` 동적 import |
| src/caps.ts | 기능 감지 `detectCaps(env?)` → `Caps`(webgpu `available/no-adapter/unsupported`, crossOriginIsolated, `IsolationMode`, decodeWorkers) |
| src/boot.ts | 위 시퀀스(M01: 1·2·4·7·8 일부 + 루프), `parseFlags`(`debug`, `world=mini|local`, `backend=webgl`, `probe=decode`, `view=<id>`, `exposure=<n>`, `sun=<방위>,<고도>`, `gpuTiming=1`, `time=<ISO>`, `shadows=0`, `mode=freecam` — 첫 표시 freecam, 기본 walk ADR-0047), 전체 화면 캔버스, `startWorld`(API 또는 픽스처 → loadWorld → 상태, `LoadedWorld` 반환) → `world.showWorld`, 렌더 초기화 실패 시 오류 표시 + 유휴 루프, `createIdleFrameSource` |
| src/world-view.ts | (`start` 옵션: 골든뷰 시작 포즈·대기 중심·fov) 조립: `createRender`·`createInput(canvas)`·`createTraversal({ ground: streaming 높이장(프록시) }, 로딩 중 freecam)`·카메라 배선 → `providers`·`frameSource`. `render.precompile`은 `createRender` 직후 시작(ADR-0060). `showWorld(loaded)` = `render.stageCells(true)` → `createStreaming`(디코드 워커) + streaming-render 배선 → `whenReady(스폰 384 m, L0)` → `precompile ∥ compileStaged` → `commitStaged` → 시작: `startMode` walk(기본 — `startWalkParams`, ADR-0047) 또는 freecam 시작 시점(골든뷰·`?mode=freecam`) → `render.loadMaterials(materialsUrl)`(비동기, 첫 표시 뒤 — `materialsSettled`) → 스폰 3×3 live 수(M02-T05) |
| src/start-view.ts | `startWalkParams(spawnWF, yawRad, ground)` = 스폰 xz 눈높이(지면 + 1.6)·world.json 방위·피치 0(M05 결정 1). freecam 시작 시점: 스크램블 교차로 북서 상공(WF −60, −15) 지면 위 60 m → Scramble Square(WF 130.8, 130, 132.5) 바라봄 |
| src/assets/characters/avatar-rb.{glb,ktx2} | 플레이어 아바타(파이프라인 `characters` 산출물, Microsoft Rocketbox MIT — ADR-0057). `world-view.ts` `AVATAR_URLS`(`new URL(…, import.meta.url)` → Vite 해시 에셋), 첫 표시 뒤 `render.loadAvatar({glb, texture})` → `avatarSettled` |
| src/credits.ts | 화면 오른쪽 아래 상시 출처 표기(`© OpenStreetMap contributors` · PLATEAU · 国土地理院 — ODbL Produced Work, M05-T02). M08 크레딧 화면이 대체 |
| src/wiring/camera.ts | phase 65: `render.setCamera(traversal.camera)` + `render.setAvatar(traversal.avatar)`(M04-T05) |
| src/debug/overlay.ts | `?debug=1` 오버레이(FPS·백엔드·깊이·카메라 WF·고도·원점·재설정 횟수·draw/tris·스트리밍 레벨별 상주/대기/fetch/디코드/실패·HLOD 부모/페이드, `data-*` e2e용 — `data-settled` = 스트리밍 0·페이드 0·`settledExtra`(머티리얼·첫 품질 티어), `data-mode`) + **O 키 원점 재설정 테스트**(+4096 m → 1 s → 복귀). `globalThis.__SANPO_DEBUG__ = { world, rebaseTest }`(디버그 모드만) |
| src/world-load.ts | `loadWorld(baseUrl, source, fetch?)` → `Result<LoadedWorld, string>`: world.json(`checkManifest`: formatVersion·WORLD_ORIGIN) → cells.idx(`cellsIndex`) → `spawnCells`(스폰 셀 ± 1 중 색인에 있는 L0), `spawnYawRad`(spawn.yawDeg), `materialsUrl`(files.materials, 픽스처 제외). 셀 fetch·검증은 streaming. `WORLD_MINI_BASE_URL`, `WORLD_LOCAL_BASE_URL`(`/local-world`) |
| src/loop.ts | rAF → scheduler.tick, `FrameHook`(before/after) |
| src/world-status.ts | `fetchWorldStatus()` → `WorldStatus`(ready/loaded/unconfigured/no-build/error). 기본 `fv` = `@sanpo/tile-format` `FORMAT_VERSION` |
| src/status-view.ts | 부트 상태 화면(M00 임시, `#app[data-isolated|data-webgpu|data-world|data-world-source|data-world-cells|data-backend|data-rendered-cells|data-error]` — e2e용). 셀이 화면에 올라오면 CSS로 숨김(오류 시 유지) |
| src/debug/stats.ts | `?debug=1` stats-gl 동적 import |
| src/debug/decode-probe.ts | `?probe=decode`(main.ts가 부트 대신 동적 import): world-mini 셀을 streaming `createFetcher` → `createDecodePool`로 2회(네트워크·Cache Storage) + 동시 4셀 + 취소 → 셀당 시간·정점/인덱스 수·긴 작업 → `globalThis.__SANPO_DECODE_PROBE__`, `#app[data-probe]`(e2e `decode.spec.ts`, ADR-0022) |
| src/wiring/streaming-render.ts | phase 45 `streaming.setInterest(traversal.interest)`, phase 55 적용(2 ms + 업로드 4 MiB/프레임, 첫 셀 보장): `addCell → ack('render') → 부모 HLOD 자식 숨김`, 해제 = `부모 보임 → removeCell`(M02-T05, ADR-0025). sim/audio/interactables 분배는 해당 태스크 |
| src/wiring/streaming-physics.ts | 물리 반경 필터, `requestSections` → physics.addCell/removeCell, `physics.setFocus(플레이어)`(앵커 재설정, M04-T06) |
| src/wiring/ground-loading.ts | phase 66: `traversal.hud.groundLoading`이 0.2 s 넘으면 화면 아래 "지면 불러오는 중…"(M04-T06, M08 HUD 전 최소 표시) |
| src/wiring/streaming-sim.ts | nav/lanes/meta 전달 |
| src/wiring/sim-physics.ts | MessageChannel 생성·연결 |
| src/wiring/env.ts | phase 66 `render.setEnvironment(sim.environment())`(M03-T03, audio는 M10), `defaultClock`(오늘 12:00 JST custom 1배속). world-view가 `createSim`(골든뷰·`?time=` = frozen) 생성, frameSource 시각 = sim 시계 |
| src/wiring/ui-bridge.ts | UiBridge 구현(시그널) |
| src/workers/*.worker.ts | 패키지 워커 엔트리 재수출(Vite 워커 번들링용) |
| src/config/*.json | 기본 설정 오버라이드 |
| src/debug/sun-override.ts | `?sun=az,el` → phase 68 `render.setEnvironment`(태양 고정, 달 반대편) — 조명·대기 확인·T02 수락 캡처 |
| src/wiring/quality.ts | 품질 티어: `?quality=` > localStorage `sanpo.quality.v1` > 첫 표시 뒤 스트리밍이 2 s 조용해지면 `render.detectQuality()`, `quality/changed`마다 저장. 골든뷰는 고정·동적 해상도 끔(M03-T08). 반환 `{ settled, off }` — settled = 첫 티어 결정 끝(e2e 안정 조건) |
| src/debug/physics-probe.ts | `?probe=physics`(+`&physicsIsolation=degraded`): 렌더 없이 물리 워커 + 상자 낙하 3 s → `__SANPO_PHYSICS_PROBE__`, `#app[data-probe]`(e2e physics.spec.ts, M04-T01) |
| src/debug/post-flags.ts | `?quality=low\|medium\|high\|ultra`, `?post=ao:gtao,ssr:0,scale:0.85,…` → RenderConfig.quality·post(M03-T07 A/B). `?dynres=0` 동적 해상도 끔, `?gpuLoad=n` 디버그 GPU 부하(M03-T08), `?forcePost=1` 소프트웨어 래스터에서도 후처리(정지 떨림 e2e, ADR-0038). `?post=aerial:full|half,exp:<n>`(ADR-0039·0040) |
| src/debug/wet-override.ts | `?wet=0..1` → `WeatherOverride`(env 배선·태양 고정이 `weather.wetness`를 덮음) + 왼쪽 아래 슬라이더(골든뷰 제외) — M03-T06 젖음 수동 검증 |
| src/three-compat.ts | Vite alias `three` 대상: `three/webgpu` + WebGL 전용 이름 2개 대체(ADR-0028) |
| src/debug/bookmarks.ts | 골든뷰 북마크(M03-T10): `?view=<id>` → `tests/golden/views.json` 동적 import(별도 청크) → 시작 포즈(절대 또는 지면 + AGL)·부팅 대기 중심·fov, `createGoldenWatch`(스트리밍 큐 0·HLOD 페이드 0·`extra` 1.5 s → `#app[data-golden=ready]`), `__SANPO_GOLDEN__` |

## Invariants
- 새 기능은 패키지에 구현하고 여기서는 배선만 추가.
- 각 wiring 파일 ≤ 200줄. 배선 로직이 커지면 해당 패키지 API가 부족하다는 신호 → 패키지 쪽 보강.

## Tests
test/caps.test.ts(WebGPU 3상태·격리·워커 수), test/boot.test.ts(루프·훅, 월드 상태 분류, 상태 문구, 플래그), test/world-load.test.ts(커밋된 world-mini를 가짜 fetch로: 4셀 로드, SPA 폴백·원점·포맷·크기 불일치 거부, `?world=mini`는 API 미호출),
test/start-view.test.ts(시작 시점 = 지면 + 60 m·Scramble Square 조준), test/walk-physics.test.ts(실제 Jolt 같은 스레드 + traversal walk: 연석 0.15 m·계단 0.18 m 카메라 프레임당 < 3 cm), test/streaming-render.test.ts(적용 순서·바이트 예산·해제 순서·적용 전 해제·L3), test/overlay.test.ts(오버레이 문구), test/bookmarks.test.ts(뷰 조회·AGL 포즈·안정 판정).
골든뷰(`pnpm golden`, 실제 GPU, CI 제외): `tests/golden/golden.spec.ts` — README 참조.
E2E(Playwright, `pnpm test:e2e` — 빌드 + vite preview, Chromium은 `--enable-unsafe-swiftshader`, 로컬 다른 Chromium은 `PW_CHROMIUM_PATH`):
`tests/e2e/boot.spec.ts`(`?world=mini` → `data-world=loaded`·셀 4·격리·콘솔 오류 없음),
`tests/e2e/render.spec.ts`(`?world=mini&debug=1&backend=webgl` → 셀 4 렌더, 중앙 타워·하단 건물 픽셀 비율, O 테스트 전후 픽셀 차 0; 스크린샷 `test-results/screenshots/` → CI 아티팩트 `e2e-screenshots`).
`tests/e2e/decode.spec.ts`(`?world=mini&probe=decode` → 4셀 정점·인덱스 수 = 파이프라인 스냅샷, 2차 Cache Storage, 취소, 긴 작업 0, 셀당 시간 첨부 `decode-probe.json`),
`tests/e2e/physics.spec.ts`(물리 워커 shared·degraded 낙하, world-mini 셀 콜라이더·레이), `tests/e2e/walk.spec.ts`(C → 지면 착지·눈높이, W 물리 속도 1.35 m/s·발 = 지면, V 3인칭 거리, C 왕복 = 바디 유지).

## Status
M00-T04 부트 골격: 기능 감지 표시 + 빈 스케줄러 루프 + `/api/world/current` 조회 + `?debug=1` stats-gl. M01-T07: 4단계 데이터 로드 + `?world=mini`. M01-T06: render·input·traversal(freecam) 조립, 디버그 오버레이.
M02-T05: streaming(6단계)·streaming→render 배선(9단계 일부)·whenReady·precompile(10단계 일부), 임시 셀 로더 삭제, `?world=local`. 나머지 5·9–11단계는 각 패키지 태스크에서.
M04-T01–T03: physics(월드 로드 뒤 스폰 앵커로 생성)·streaming→physics 배선, traversal 컨텍스트 `physics` = getter(월드 로드 뒤 walk 가능). 시작은 freecam, C = 걷기(ADR-0043) → M05 결정 1: 시작 = walk, freecam은 C·`?mode=freecam`·골든뷰(ADR-0047).
