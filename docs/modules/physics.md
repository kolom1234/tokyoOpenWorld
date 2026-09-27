# @sanpo/physics
Layer: L2 | Depends: core, geo, tile-format(JCOL 파서, 워커 내), jolt-physics@1.1.0 | Used by: traversal(api), apps/game

## Purpose
Jolt 기반 물리를 전용 워커에서 실행: 셀 콜라이더, 캐릭터, 승용차, 자전거, 열차·교통 키네마틱, 레이/스피어 캐스트. 메인은 명령 큐 + 보간 스냅샷만.
상세: `docs/08-physics.md` (API 전문 §10).

## Public API (요약)
`createPhysics(deps) → PhysicsService`: `ready, isolation, addCell, removeCell, hasCell, spawnCharacter, spawnVehicle, despawn, setCharacterInput, setVehicleInput, teleport, pose, wheels, raycast, sphereCast, connectKinematicSource` (+ `SystemProvider`: phase 30).

## Invariants
- Jolt 객체는 워커 밖으로 나가지 않는다. 메인↔워커 좌표는 WF float64.
- 120 Hz 고정 스텝, 틱당 최대 4스텝.
- 셀 콜라이더 적재는 틱당 1셀(적재 큐).
- 보행자·차량 간 물리 충돌 없음(레이어 행렬) + AEB로 비폭력 보장.
- `new Jolt.*` 설정 객체는 `jolt-mem.ts` 헬퍼로 반드시 해제.

## Files
host/(physics-host, command-queue, snapshot-reader), worker/(physics.worker, jolt-init, jolt-mem, layers, world, cell-colliders, heightfield, character, vehicle-sedan, vehicle-bicycle, kinematics, queries, snapshot-writer), protocol.ts.

## Tests
워커 통합(브라우저 모드): 낙하, 계단 3단, 연석, 차량 가속/제동 범위, 자전거 저속 안정, 키네마틱 바닥 위 보행, 앵커 재설정 후 위치 보존.

## Status
미구현 (M04).

## Gotchas
- 멀티스레드 빌드는 `crossOriginIsolated` 필수 → 헤더 누락 시 자동 싱글스레드 + 경고.
- 차량 파라미터는 코드 상수 금지 → `content/vehicles/*.json`.
