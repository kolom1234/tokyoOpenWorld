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
| src/boot.ts | 위 시퀀스(M00: 1·2·4 + 빈 루프), `parseFlags`(`debug`, `world=mini`), `startWorld`(API 또는 픽스처 → loadWorld → 상태), `createIdleFrameSource` |
| src/world-load.ts | `loadWorld(baseUrl, source, fetch?)` → `Result<LoadedWorld, string>`: world.json(`checkManifest`: formatVersion·WORLD_ORIGIN) → cells.idx → 스폰 셀 ± 1 TKC 크기·헤더 확인. `WORLD_MINI_BASE_URL`. M02 streaming 도입 시 셀 로드는 그쪽으로 |
| src/loop.ts | rAF → scheduler.tick, `FrameHook`(before/after) |
| src/world-status.ts | `fetchWorldStatus()` → `WorldStatus`(ready/loaded/unconfigured/no-build/error). 기본 `fv` = `@sanpo/tile-format` `FORMAT_VERSION` |
| src/status-view.ts | 부트 상태 화면(M00 임시, `#app[data-isolated|data-webgpu|data-world|data-world-source|data-world-cells]` — e2e용) |
| src/debug/stats.ts | `?debug=1` stats-gl 동적 import |
| src/wiring/streaming-render.ts | onReady/onEvicted → render(+ack), HLOD 자식 가시성, sim/audio/interactables 분배 |
| src/wiring/streaming-physics.ts | 물리 반경 필터, `requestSections` → physics.addCell/removeCell |
| src/wiring/streaming-sim.ts | nav/lanes/meta 전달 |
| src/wiring/sim-physics.ts | MessageChannel 생성·연결 |
| src/wiring/env.ts | sim.environment() → render.setEnvironment, audio |
| src/wiring/ui-bridge.ts | UiBridge 구현(시그널) |
| src/workers/*.worker.ts | 패키지 워커 엔트리 재수출(Vite 워커 번들링용) |
| src/config/*.json | 기본 설정 오버라이드 |
| src/debug/{bookmarks,overlay}.ts | 골든뷰 북마크, 디버그 패널 |

## Invariants
- 새 기능은 패키지에 구현하고 여기서는 배선만 추가.
- 각 wiring 파일 ≤ 200줄. 배선 로직이 커지면 해당 패키지 API가 부족하다는 신호 → 패키지 쪽 보강.

## Tests
test/caps.test.ts(WebGPU 3상태·격리·워커 수), test/boot.test.ts(루프·훅, 월드 상태 분류, 상태 문구, 플래그), test/world-load.test.ts(커밋된 world-mini를 가짜 fetch로: 4셀 로드, SPA 폴백·원점·포맷·크기 불일치 거부, `?world=mini`는 API 미호출).
E2E: `tests/e2e/boot.spec.ts`(Playwright, `pnpm test:e2e` — 빌드 + vite preview, `?world=mini` → `data-world=loaded`·셀 4·격리·콘솔 오류 없음).

## Status
M00-T04 부트 골격: 기능 감지 표시 + 빈 스케줄러 루프 + `/api/world/current` 조회 + `?debug=1` stats-gl. M01-T07: 4단계 데이터 로드(world.json 원점 검증·cells.idx·스폰 주변 셀 헤더) + `?world=mini`. 부트 5–11단계는 각 패키지 태스크에서 배선.
