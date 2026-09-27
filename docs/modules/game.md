# apps/game (Composition Root)
Layer: L5 | Depends: 모든 @sanpo 패키지 | Used by: apps/worker(정적 에셋으로 서빙)

## Purpose
브라우저 엔트리. 기능 감지 → 서비스 생성 → 패키지 간 배선 → 루프 실행. **게임 로직을 두지 않는다**(배선·설정·부트만).

## 부트 시퀀스 (src/boot.ts)
```
1. caps = detectCaps()                       // WebGPU, crossOriginIsolated, cores, detect-gpu 티어
2. log, bus, scheduler = core
3. cfg = mergeConfig(defaults, config/*.json, urlFlags)
4. { buildId, baseUrl } = GET /api/world/current?fv=FORMAT_VERSION → world.json 로드, geo 원점 검증
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
| src/main.ts | 엔트리, 오류 화면 |
| src/caps.ts | 기능 감지 |
| src/boot.ts | 위 시퀀스 |
| src/loop.ts | rAF → scheduler.tick |
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

## Status
미구현 (M00-T04).
