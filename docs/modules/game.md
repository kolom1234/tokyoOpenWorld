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
| index.html, vite.config.ts | Vite 엔트리. dev 서버 격리 헤더 + `/api`·`/world` → `wrangler dev`(8787) 프록시 + `sanpo-world-mini` 플러그인(dev 서빙, build 시 `dist/fixtures/world-mini` 복사, `SANPO_WORLD_MINI=0`이면 생략) |
| public/_headers | 정적 에셋 COOP/COEP/CORP/CSP·캐시 헤더(docs/13 §3) — Worker를 거치지 않는 응답용 |
| src/main.ts | 엔트리, 오류 화면 |
| src/caps.ts | 기능 감지 `detectCaps(env?)` → `Caps`(webgpu `available/no-adapter/unsupported`, crossOriginIsolated, `IsolationMode`, decodeWorkers) |
| src/boot.ts | 위 시퀀스(M01: 1·2·4·7·8 일부 + 루프), `parseFlags`(`debug`, `world=mini`, `backend=webgl`), 전체 화면 캔버스, `startWorld`(API 또는 픽스처 → loadWorld → 상태, `LoadedWorld` 반환) → `world.showWorld`, 렌더 초기화 실패 시 오류 표시 + 유휴 루프, `createIdleFrameSource` |
| src/world-view.ts | M01-T06 최소 조립: `createRender`·`createInput(canvas)`·`createTraversal({ ground: 로컬 높이장 }, freecam 시작)`·카메라 배선 → `providers`·`frameSource`, `showWorld(loaded)`(셀 → render.addCell, 지면 등록, 시작 시점 재설정) |
| src/start-view.ts | 시작 시점: 스크램블 교차로 북서 상공(WF −60, −15) 지면 위 60 m → Scramble Square(WF 130.8, 130, 132.5) 바라봄 |
| src/wiring/camera.ts | phase 65: `render.setCamera(traversal.camera)` |
| src/debug/local-cells.ts | **임시(M02-T05에서 삭제)**: TKC → GLTFLoader+meshopt(메인 스레드) → `CellPayload`(ADR-0020), `terrain.height` → `LocalGround`(이중선형) |
| src/debug/overlay.ts | `?debug=1` 오버레이(FPS·백엔드·깊이·카메라 WF·고도·원점·재설정 횟수·draw/tris, `data-*` e2e용) + **O 키 원점 재설정 테스트**(+4096 m → 1 s → 복귀). `globalThis.__SANPO_DEBUG__ = { world, rebaseTest }`(디버그 모드만) |
| src/world-load.ts | `loadWorld(baseUrl, source, fetch?)` → `Result<LoadedWorld, string>`: world.json(`checkManifest`: formatVersion·WORLD_ORIGIN) → cells.idx → 스폰 셀 ± 1 TKC 크기·헤더 확인. `WORLD_MINI_BASE_URL`. M02 streaming 도입 시 셀 로드는 그쪽으로 |
| src/loop.ts | rAF → scheduler.tick, `FrameHook`(before/after) |
| src/world-status.ts | `fetchWorldStatus()` → `WorldStatus`(ready/loaded/unconfigured/no-build/error). 기본 `fv` = `@sanpo/tile-format` `FORMAT_VERSION` |
| src/status-view.ts | 부트 상태 화면(M00 임시, `#app[data-isolated|data-webgpu|data-world|data-world-source|data-world-cells|data-backend|data-rendered-cells|data-error]` — e2e용). 셀이 화면에 올라오면 CSS로 숨김(오류 시 유지) |
| src/debug/stats.ts | `?debug=1` stats-gl 동적 import |
| src/wiring/streaming-render.ts | onReady/onEvicted → render(+ack), HLOD 자식 가시성, sim/audio/interactables 분배 |
| src/wiring/streaming-physics.ts | 물리 반경 필터, `requestSections` → physics.addCell/removeCell |
| src/wiring/streaming-sim.ts | nav/lanes/meta 전달 |
| src/wiring/sim-physics.ts | MessageChannel 생성·연결 |
| src/wiring/env.ts | sim.environment() → render.setEnvironment, audio |
| src/wiring/ui-bridge.ts | UiBridge 구현(시그널) |
| src/workers/*.worker.ts | 패키지 워커 엔트리 재수출(Vite 워커 번들링용) |
| src/config/*.json | 기본 설정 오버라이드 |
| src/debug/bookmarks.ts | 골든뷰 북마크(M03) |

## Invariants
- 새 기능은 패키지에 구현하고 여기서는 배선만 추가.
- 각 wiring 파일 ≤ 200줄. 배선 로직이 커지면 해당 패키지 API가 부족하다는 신호 → 패키지 쪽 보강.

## Tests
test/caps.test.ts(WebGPU 3상태·격리·워커 수), test/boot.test.ts(루프·훅, 월드 상태 분류, 상태 문구, 플래그), test/world-load.test.ts(커밋된 world-mini를 가짜 fetch로: 4셀 로드, SPA 폴백·원점·포맷·크기 불일치 거부, `?world=mini`는 API 미호출),
test/local-cells.test.ts(L0_0_0 건물 양자화 해제 → 지붕 TP 245.6 m, 지형 float32·인덱스, 높이장 보간, 시작 시점 = 지면 + 60 m·Scramble Square 조준), test/overlay.test.ts(오버레이 문구).
E2E(Playwright, `pnpm test:e2e` — 빌드 + vite preview, Chromium은 `--enable-unsafe-swiftshader`, 로컬 다른 Chromium은 `PW_CHROMIUM_PATH`):
`tests/e2e/boot.spec.ts`(`?world=mini` → `data-world=loaded`·셀 4·격리·콘솔 오류 없음),
`tests/e2e/render.spec.ts`(`?world=mini&debug=1&backend=webgl` → 셀 4 렌더, 중앙 타워·하단 건물 픽셀 비율, O 테스트 전후 픽셀 차 0; 스크린샷 `test-results/screenshots/` → CI 아티팩트 `e2e-screenshots`).

## Status
M00-T04 부트 골격: 기능 감지 표시 + 빈 스케줄러 루프 + `/api/world/current` 조회 + `?debug=1` stats-gl. M01-T07: 4단계 데이터 로드(world.json 원점 검증·cells.idx·스폰 주변 셀 헤더) + `?world=mini`. M01-T06: render·input·traversal(freecam) 조립, 임시 셀 로더, 디버그 오버레이. 부트 5·6·9–11단계는 각 패키지 태스크에서 배선.
