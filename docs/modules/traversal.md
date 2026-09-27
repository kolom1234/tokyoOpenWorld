# @sanpo/traversal
Layer: L3 | Depends: core, geo, input(api), physics(api) | Used by: apps/game

## Purpose
이동 모드 상태기계(walk/drive/cycle/train/freecam/transition), 모드별 의도→물리 명령, 카메라 리그, 상호작용 조회, 스트리밍 관심점 산출.
상세: `docs/09-traversal.md` (API 전문 §6).

## Public API (M01-T06 구현분)
```ts
createTraversal(ctx: TraversalContext, opts?: { settings?: DeepPartial<TraversalSettings>; initial?: { mode: ModeId; params?: unknown } }): TraversalService
TraversalContext { input: InputService; bus: EventBus; log: Logger; ground: GroundQuery; trains?: () => TrainInfo[] }  // physics?: M04
TraversalService extends SystemProvider {   // system 'traversal', phase 20
  readonly mode: ModeId; readonly player: PlayerState; readonly camera: CameraState;   // 참조 고정(FrameSource가 계속 읽음)
  readonly hud: HudHints; readonly interest: InterestPoint[];
  request(to, params?): boolean;             // 미등록·requires 미충족 → false. 같은 모드 재요청 = params로 재진입
  teleport(posWF, yawRad): Promise<void>;    // M01: 즉시 이동(모드의 teleport). transition·스트리밍 대기는 M02-T05 이후
  register(mode: TraversalMode): void;
}
TraversalMode { id; requires: ('physics'|'trains')[]; enter(ctx, from, params?); update(frame, ctx): ModeOutput; exit(ctx, to); teleport?(posWF, yaw) }
FreecamParams { posWF: Vec3d; yawRad; pitchRad }   // yaw: +Y축 반시계, 0 = −Z(도북); pitch 위 +
TraversalSettings { lookRadPerPx 0.0025; fovDeg 70; nearM 0.1; freecam: { dampingPerS 3; min/max/startSpeedMs 0.5/60/15; speedStepPerNotch 1.25; sprintMultiplier 4; maxAltitudeM 1000; minClearanceM 1 } }
forwardOf(yaw, pitch): Vec3;  lookAtAngles(fromWF, toWF): { yawRad; pitchRad };  DEFAULT_TRAVERSAL_SETTINGS
```
미구현: `interactables`(M04~), walk/drive/cycle/train/transition 모드, phase 35(traversalPost).

## Invariants
- 모드 1개 = 파일 1개(`internal/modes/<id>.ts`), 레지스트리 등록으로 확장(기존 모드 수정 금지).
- 전환은 1프레임 내 원자적(exit → 핸들 교체 → enter → `mode/changed`). 모드는 enter에서 input 컨텍스트를 설정(freecam = 'fly').
- 카메라 출력은 항상 `CameraState`(WF float64). 롤 잠금(쿼터니언 = yaw(Y)·pitch(X), 피치 ±89°).
- traversal은 render/sim을 직접 호출하지 않는다(출력만 제공, 배선은 apps/game). 열차 정보는 컨텍스트의 `trains()` 함수로만 받음.
- `physics`가 없으면(M04 이전) `requires: ['physics']` 모드는 진입 불가, freecam만 동작. C 키: freecam ↔ 직전 모드(없거나 불가면 유지).
- freecam: 전방 이동은 피치 포함(6DOF), 좌우는 수평, E/Q는 월드 위아래. 지면을 알면 지면 + 1 m 아래로 내려가지 않음(soft 충돌 대용), 고도 ≤ 1,000 m.
- physics 전에는 `player.posWF` = 카메라 위치, `player.yawRad` = 카메라 수평 방위.

## Files
api.ts, internal/(fsm, service, settings), internal/modes/freecam.ts, internal/camera/free-rig.ts.
예정: modes/(walk, drive, cycle, train, transition), camera/(first-person-rig, third-person-rig, chase-rig, attached-rig), interactables.ts, interest.ts.

## Tests
test/free-rig.test.ts(방향 규약·쿼터니언 = forwardOf·롤 잠금, lookAt 역함수, 관성 감쇠 수치, 휠 속도 범위, sprint, 고도 상한·지면 여유, 피치 제한),
test/service.test.ts(시작 포즈·fly 컨텍스트·phase, W 이동·km/h, teleport, physics 필요 모드 거부·C 토글·중복 등록).

## Status
M01-T06 freecam(physics 없음) → M04(walk·physics), M07(train), M08(transition·상호작용).
