# @sanpo/traversal
Layer: L3 | Depends: core, geo, input(api), physics(api) | Used by: apps/game

## Purpose
이동 모드 상태기계(walk/drive/cycle/train/freecam/transition), 모드별 의도→물리 명령, 카메라 리그, 상호작용 조회, 스트리밍 관심점 산출.
상세: `docs/09-traversal.md` (API 전문 §6).

## Public API (M01-T06 freecam, M04-T03 walk)
```ts
createTraversal(ctx: TraversalContext, opts?: { settings?: DeepPartial<TraversalSettings>; initial?: { mode: ModeId; params?: unknown } }): TraversalService
TraversalContext { input: InputService; bus: EventBus; log: Logger; ground: GroundQuery; physics?: PhysicsService; trains?: () => TrainInfo[] }  // 요구조건은 요청 때마다 평가(physics getter 가능)
TraversalService extends SystemProvider {   // system 'traversal', phase 20
  readonly mode: ModeId; readonly player: PlayerState; readonly camera: CameraState;   // 참조 고정(FrameSource가 계속 읽음)
  readonly hud: HudHints; readonly interest: InterestPoint[]; readonly view: 'first' | 'third';   // walk 시점(V)
  readonly avatar: AvatarState;             // 참조 고정 — 배선이 render.setAvatar로(M04-T05). freecam에선 세워 둔 바디를 대기 자세로
  request(to, params?): boolean;             // 미등록·requires 미충족 → false. 같은 모드 재요청 = params로 재진입
  teleport(posWF, yawRad): Promise<void>;    // M01: 즉시 이동(모드의 teleport). transition·스트리밍 대기는 M02-T05 이후
  register(mode: TraversalMode): void;
}
TraversalMode { id; requires: ('physics'|'trains')[]; enter(ctx, from, params?); update(frame, ctx): ModeOutput; exit(ctx, to); teleport?(posWF, yaw) }
ModeOutput { camera; interest; hud; player?: ModePlayer { posWF; velWF; yawRad }; avatar?: AvatarState }   // player 없으면 카메라 = 플레이어(freecam)
WalkParams { posWF 기준점; yawRad; pitchRad? }   // 바디가 returnToBodyM 안이면 복귀, 아니면 기준점 아래 지면(하늘 레이 → TERRAIN)에 놓기
FreecamParams { posWF: Vec3d; yawRad; pitchRad }   // yaw: +Y축 반시계, 0 = −Z(도북); pitch 위 +
TraversalSettings { lookRadPerPx 0.0025; fovDeg 70; nearM 0.1; freecam: { dampingPerS 3; min/max/startSpeedMs 0.5/60/15; speedStepPerNotch 1.25; sprintMultiplier 4; maxAltitudeM 1000; minClearanceM 1 };
  walk: { paceSpeedsMs [1.35, 1.8, 3.0]; sprintMs 5; eyeHeightM 1.6; headBob true; bobVerticalM 0.012; bobLateralM 0.006; lookSmoothingS 0.03; eyeFollowPerS 12(임계 감쇠 스프링 ω);
          thirdPerson { shoulderM 0.4; distanceM 3.5; min 1.5; max 6; pivotHeightM 1.55 }; returnToBodyM 150; view 'first' } }
forwardOf(yaw, pitch): Vec3;  lookAtAngles(fromWF, toWF): { yawRad; pitchRad };  DEFAULT_TRAVERSAL_SETTINGS
```
**M07-T05**(ADR-0074): `TraversalContext += trainCar(tripId, car): TrainCarPose | undefined; trainRide(tripId): TrainRideInfo | undefined; jumpClock(gameMs)`(core 타입),
`TrainParams { tripId; car?; view?: TrainView('standing'|'seated'|'frontView') }`, `HudHints += train?: TrainHud { tripId, lineId, routeId, heading, view, car, stoppedAtStationId, nextStationId, doorSide, arrivalInS, notice('mvpEdge'|null), skipping }; fade?: 0..1`,
`ModeOutput += next?: { mode, params? }`(모드가 스스로 전환 — 서비스가 출력 뒤 요청), `WalkParams += exact?`(지면 탐색 없이 그 자리 — 열차 하차).
미구현: `interactables`(M08), drive/cycle/transition 모드, phase 35(traversalPost).

## Invariants
- 모드 1개 = 파일 1개(`internal/modes/<id>.ts`), 레지스트리 등록으로 확장(기존 모드 수정 금지).
- 전환은 1프레임 내 원자적(exit → 핸들 교체 → enter → `mode/changed`). 모드는 enter에서 input 컨텍스트를 설정(freecam = 'fly').
- 카메라 출력은 항상 `CameraState`(WF float64). 롤 잠금(쿼터니언 = yaw(Y)·pitch(X), 피치 ±89°).
- traversal은 render/sim을 직접 호출하지 않는다(출력만 제공, 배선은 apps/game). 열차 정보는 컨텍스트의 `trains()` 함수로만 받음.
- `physics`가 없으면 `requires: ['physics']` 모드는 진입 불가, freecam만 동작. C 키: freecam ↔ 직전 모드(없으면 walk, 불가면 유지). 전환 파라미터 = 지금 카메라 포즈(ADR-0043).
- walk 발밑 보호(ADR-0046, `ground-guard.ts`): 발 아래 L0 셀 미적재 = hold(제자리 고정), 제동 거리 + 0.6 m 앞 셀 미적재 = stop(입력 0), `hud.groundLoading`.
- walk 3인칭(ADR-0045): 카메라 시선은 스무딩 시선을 프레임당 ≤ 8°로 따라가고, 매 프레임 부채꼴 5개(가운데·yaw ±8°·pitch ±8°) 붐 sphereCast(반경 0.2 m) 최솟값으로 다음 프레임 붐 길이를 자른다(당기기 즉시·풀기 4 m/s). 붐 0.5–1.2 m에서 아바타 디더 페이드.
- walk: 발 높이 변화(연석·계단)는 임계 감쇠 스프링(ω 12)으로 따라가 카메라 프레임당 < 3 cm(ADR-0044), 에스컬레이터 운반 중 헤드밥 끔.
  공중 프레임(낙하·램프 끝에서 몇 프레임 뜸)은 스냅 없이 남은 오프셋을 둔 채 몸과 함께(착지 첫 프레임 스프링 속도 ≤ 1 m/s — 파고듦 ≤ 3 cm), 헤드밥은 공중 0.3 s 미만이면 유지(M05-T08, ADR-0056).
- walk: 입력 → 카메라 yaw 기준 원하는 수평 속도 → `setCharacterInput`(가감속은 physics). 포즈 = 보간 스냅샷(발). 놓은 직후 옛 스냅샷(2 m 밖)은 무시. 착지점 = 하늘 레이 첫 충돌이 TERRAIN인 후보.
- freecam: 전방 이동은 피치 포함(6DOF), 좌우는 수평, E/Q는 월드 위아래. 지면을 알면 지면 + 1 m 아래로 내려가지 않음(soft 충돌 대용), 고도 ≤ 1,000 m.
- 바디 없는 모드(freecam)에서는 `player.posWF` = 카메라 위치, `player.yawRad` = 카메라 수평 방위. walk = 발 위치·물리 속도·몸 방향.

## Files
api.ts, internal/(fsm, service — 승차 판정(walk 중 F + 칸 안)·모드 next 요청, settings, walk-placement — 착지점 하늘 레이, ground-guard — 발밑·앞 셀 적재 확인), internal/modes/(freecam, walk, train — 칸 카메라 시점·빨리감기·하차·경계역 자동 하차, M07-T05), internal/camera/(attached-rig — 부모 칸 로컬 오프셋·시선·미세 진동(M07-T05), free-rig, free-guard — freecam 지오메트리 진입 방지(구 캐스트 쓸기 + 6방향 레이 안쪽 판정, ADR-0059), first-person-rig — 시선 스무딩·발 높이 스프링·헤드밥, third-person-rig — 붐·아바타 페이드, boom — 부채꼴 sphereCast·회전 상한).
예정: modes/(drive, cycle, train, transition), camera/(chase-rig, attached-rig), interactables.ts, interest.ts.

## Tests
test/free-rig.test.ts(방향 규약·쿼터니언 = forwardOf·롤 잠금, lookAt 역함수, 관성 감쇠 수치, 휠 속도 범위, sprint, 고도 상한·지면 여유, 피치 제한),
test/service.test.ts(시작 포즈·fly 컨텍스트·phase, W 이동·km/h, teleport, physics 필요 모드 거부·C 토글·중복 등록),
test/free-guard.test.ts(벽 접촉 멈춤·법선 속도 제거, 닿은 채 떨어지기, 닫힌 판 안 → 가까운 뒷면 너머, 바깥 시작 유지·늦은 결과 버림),
test/train.test.ts(M07-T05: 붙은 카메라 오프셋·yaw, 시점 순환·다음 역·4 s 앞 관심점, T 빨리감기 = 페이드 → 도착 8 s 전 점프, F 하차 = 승강장 쪽 문 앞 exact, 마지막 정차 안내 뒤 자동 하차, 칸 안 판정),
test/walk.test.ts(가짜 physics: C → 지붕 아닌 지면 착지·대기 중 카메라 유지, 걸음 단계·달리기·대각선, FP 눈높이, V 3인칭 어깨·뒤·붐 풀림·벽 1 m → 0.95 m 안·아바타 페이드, C 복귀 = 바디, 멀면 다시 놓기).

## Status
M01-T06 freecam(physics 없음), M04-T03 walk(ADR-0043), T04 발 높이 스프링(ADR-0044, 공중 연속 M05-T08 ADR-0056), T05 3인칭 충돌·아바타(ADR-0045), T06 발밑 보호(ADR-0046), M06 사전 3 freecam 진입 방지(ADR-0059) → M07(train), M08(transition·상호작용).
