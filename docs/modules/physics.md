# @sanpo/physics
Layer: L2 | Depends: core, geo, tile-format(JCOL 파서, 워커 내), jolt-physics@1.1.0(single-thread wasm-compat — ADR-0041) | Used by: traversal(api), apps/game

## Purpose
Jolt 기반 물리를 전용 워커에서 실행: 셀 콜라이더, 캐릭터, 승용차, 자전거, 열차·교통 키네마틱, 레이/스피어 캐스트. 메인은 명령 큐 + 보간 스냅샷만.
상세: `docs/08-physics.md` (API 전문 §10).

## Public API (M04-T01 구현분)
```ts
createPhysics(deps: PhysicsDeps): PhysicsService      // PhysicsDeps { bus, log, supervisor? | transport?, originWF, config?, now? }
PhysicsConfig { stepHz 120; maxStepsPerTick 4; interpolationDelayS 1/60+1/120; isolation 'auto'|'degraded'|'shared'(Node 테스트); anchorGridM 1024; cellBudgetMs 4 }
PhysicsService extends SystemProvider {   // system 'physics', phase 30 — 프레임마다 step(targetS = 메인 시계, 명령 묶음) + 스냅샷 읽기
  readonly ready: Promise<void>; readonly isolation: 'shared' | 'degraded';
  debugSpawnBox(posWF, halfExtentM: Vec3, dynamic: boolean): BodyHandle;   // 수락·테스트용(dynamic = VEHICLE, static = STATIC_WORLD)
  despawn(h); teleport(h, posWF, yawRad);
  addCell(key, originWF, jcol?: ArrayBuffer, heightfield?: HeightfieldData); removeCell(key); hasCell(key)   // M04-T02 셀 콜라이더(적재 큐, ADR-0042)
  raycast(originWF, dir, maxDist): Promise<RayHit | null>   // RayHit { posWF, normal, distance, layer, material } — 삼각형 양면
  pose(h): Readonly<Pose> | undefined;     // Pose { posWF, quat, linVel, grounded, groundMaterial } — 렌더 시각(지금 − 지연) 보간
  stats(): PhysicsStats;                    // ready, isolation, build, steps, simTimeS, bodies, initMs, tickMs, anchorWF, colliderCells, colliderPending, loadTickMaxMs, loadTicksOver8Ms
  dispose();
}
PhysicsTransport { post; onMessage; terminate }   // 워커 대신 주입(테스트: 같은 스레드 워커 코어)
anchorOf(posWF, gridM) → 앵커(x·z 격자, y 0); PHYSICS_PHASE = 30; DEFAULT_PHYSICS_CONFIG
```
예정: spawnCharacter/setCharacterInput(T03), sphereCast(T05), spawnVehicle·wheels·connectKinematicSource(M05~).

## Invariants
- Jolt 객체는 워커 밖으로 나가지 않는다. 메인↔워커 좌표는 WF float64, 워커 안에서만 PHYS = WF − 앵커(float32).
- 메인이 스텝을 구동한다(워커 자체 타이머 없음): simT + 1/120 ≤ targetS인 동안, 틱당 최대 4스텝, 초과 시간은 버림.
- 스냅샷: SAB 헤더(writeIndex·seq) + 버퍼 2개, 메인은 seqlock으로 복사. 폴백 = 같은 배치 한 버퍼 postMessage(Transferable).
- 핸들 = 슬롯(0–127) | 세대 << 7, 바디 기록의 handle로 옛 핸들 무시.
- 값 반환 `BodyID`는 바인딩 임시 객체 → 복사해 보관·제거 때 해제. `new Jolt.*` 설정 객체는 `Jolt.destroy`(jolt-mem `using`).
- 셀 콜라이더 적재: 셀 = [높이장, JCOL triMesh 청크(≤ 2500 삼각형)] 작업, 틱마다 예산 4 ms 안(예상 비용으로 판단, 최소 1작업) — ADR-0042. 레이·충돌은 삼각형 양면(PLATEAU 감김 불일치). 보행자·차량 간 물리 충돌 없음(레이어 행렬 08 §3 = worker/layers.ts `COLLISION_PAIRS`).

## Files
api.ts, internal/protocol.ts(메시지·스냅샷 배치·isIsolated), internal/service.ts(createPhysics·핸들·연결),
internal/host/(command-queue, snapshot-reader — 기록·보간·readSab), internal/worker/(physics.worker — 엔트리, core — 메시지·고정 스텝, jolt-init — single 빌드,
jolt-mem — using·스크래치, layers — 레이어·행렬·필터, world — JoltInterface, bodies — 슬롯·명령·기록, snapshot-writer — SAB·post 싱크,
cell-colliders — 셀 적재 큐·정적 바디, heightfield — 높이장·메시 셰이프(힙 직접 채움)·워밍업, queries — 레이캐스트).
예정: worker/(character, vehicle-*, kinematics).

## Tests
test/layers-snapshot.test.ts(충돌 행렬·브로드페이즈 매핑·보간·같은 시각 교체·순간이동 스냅·SAB seqlock),
test/worker-integration.test.ts(같은 스레드 워커 코어 + 실제 Jolt: SAB·폴백 낙하 — 스냅샷 시각 보간 = 워커 값, 사이 = 선형, 바닥 정지, 슬롯 재사용),
test/cell-colliders.test.ts(world-mini 4셀 적재 — 8 ms 초과 틱 ≤ 1(Node GC), 지면 레이 = 높이장 ±5 cm, 벽 레이 = JCOL CPU 교차 ±5 cm, 제거 후 미스).
E2E tests/e2e/physics.spec.ts(`?probe=physics`, 프로덕션 preview 격리: shared·degraded; world-mini 부트 → 셀 콜라이더 적재·지면/벽 레이).

## Status
M04-T01 워커 부트스트랩, T02 셀 콜라이더(ADR-0042) → T03(캐릭터).

## Gotchas
- multithread 빌드 금지(ADR-0041): Vite가 pthread 워커를 iife로 중첩 번들 → 최상위 await 빌드 실패. `apps/game` vite `worker.format = 'es'`.
- jolt wasm-compat은 `node:module`을 참조(emscripten Node 경로) → Vite가 브라우저용으로 외부화 경고만.
- SAB 모드 통계·포즈는 워커보다 한 프레임 늦다(읽기 = step 전송 직후).
- 차량 파라미터는 코드 상수 금지 → `content/vehicles/*.json`.
