# 08 — Physics (`@sanpo/physics`)

## 1. 구성
- 엔진: `jolt-physics` 1.1.0 — **`jolt-physics/wasm-compat`(single-thread) 고정**(ADR-0041: multithread 빌드는 Vite 중첩 pthread 워커 번들이 깨지고 초기화 ≈ 3 s). 격리 여부는 스냅샷 전달(SAB/postMessage)만 가른다.
- 스텝은 메인이 구동(physics 시스템 phase 30이 프레임마다 목표 시각 + 명령 묶음 전송, ADR-0041).
- **모든 Jolt 객체는 `physics.worker`에만 존재**. 메인은 `PhysicsHost`(명령 큐 + 스냅샷 리더)만 가진다.
- 고정 스텝 120 Hz (`dt = 1/120`), 누적기 방식. 한 틱에 최대 4스텝, 초과분은 버림(스파이럴 방지).
- Jolt 메모리 규칙: `new Jolt.X()`로 만든 설정 객체는 사용 후 `Jolt.destroy()` 필수. `internal/jolt-mem.ts`의 `using` 헬퍼로 강제.

## 2. 좌표
- PHYS = WF − `physicsAnchor` (float32). 앵커는 세션 시작 시 플레이어 위치의 1024 m 격자점.
- 플레이어가 앵커에서 4096 m 초과 → `rebaseAnchor`: 모든 바디 위치 −Δ 이동 후 `OptimizeBroadPhase()`. 한 프레임 일시정지 허용.
- 명령/스냅샷의 위치는 **WF float64로 주고받고** 워커 내부에서만 PHYS로 변환한다.

## 3. 레이어
| ObjectLayer | 값 | 설명 | BroadPhase |
|---|---|---|---|
| `STATIC_WORLD` | 0 | 건물, 연석, 교량, 계단 램프 | NON_MOVING |
| `TERRAIN` | 1 | HeightFieldShape | NON_MOVING |
| `PROP_STATIC` | 2 | 전신주, 신호등 기둥, 자판기, 가드레일, 나무 줄기 | NON_MOVING |
| `CHARACTER` | 3 | 플레이어 캐릭터(CharacterVirtual 내부 바디) | MOVING |
| `VEHICLE` | 4 | 플레이어 차량/자전거 | MOVING |
| `NPC_KINEMATIC` | 5 | 플레이어 60 m 내 교통 차량, 20 m 내 보행자 캡슐 | MOVING |
| `TRAIN` | 6 | 열차 차체(키네마틱), 바닥 포함 | MOVING |
| `SENSOR` | 7 | 개찰구, 에스컬레이터 구간, 승하차 존 | SENSOR |

충돌 행렬(✔=충돌):
| | STATIC | TERRAIN | PROP | CHAR | VEH | NPC | TRAIN | SENSOR |
|---|---|---|---|---|---|---|---|---|
| CHARACTER | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔(감지) |
| VEHICLE | ✔ | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ |
| NPC_KINEMATIC | – | – | – | ✔ | ✔ | – | – | – |
| TRAIN | – | – | – | ✔ | ✔ | – | – | ✔ |

## 4. 월드 콜라이더 적재
- 물리 반경: 도보 256 m, 자전거 320 m, 차량 512 m, 열차 탑승 중 = 열차 주변 256 m. 스트리밍 L0 셀 중 반경 내 셀만 `addCell`.
- 공급 경로: wiring이 물리 반경 내 `live` 셀에 대해 `streaming.requestSections(key, ['collision.bin','terrain.height'])` → `physics.addCell(...)`(Transferable).
- `addCell(key, originWF, jcol, heightfield)`: JCOL 파싱(`@sanpo/tile-format`의 `parseJcol`을 워커에서 사용 — 별도 파서 금지) → 삼각 메시는 `MeshShapeSettings` → 셀당 정적 바디 1개(서브 셰이프 머티리얼 포함), 프리미티브는 `StaticCompoundShape`로 묶어 1개(구현: 층·재질·flags·64 m 블록별, 작업당 ≤ 24개 — 소품 M05-T03, ADR-0051). 높이장 → `HeightFieldShapeSettings`(257², 블록 크기 4).
- 셰이프 생성은 워커에서 수 ms 걸리므로 **적재 큐**: 파이프라인이 건물 메시를 ≤ 2500 삼각형 청크(JCOL 셰이프 여러 개)로 자르고, 워커는 이를 다시 [높이장 4×4 타일, ≤ 600 삼각형 조각] 작업으로 나눠 조각마다 예산 3 ms 안에서 처리 — step 때와 메시지 사이 빈 시간 모두(ADR-0042 부록 A·B, 셀 하나를 한 틱에 만들면 8–30 ms).
- 공급 경로 구현: 게임 `wiring/streaming-physics.ts`가 버스 `cell/ready`(onReady는 렌더 단독)로 live L0를 추적. 레이·충돌은 삼각형 양면(PLATEAU 감김 불일치).
- 플레이어 발밑 셀 콜라이더가 없으면 `groundMissing` 플래그 → traversal이 이동을 일시 정지(낙하 방지).

## 5. 캐릭터 (도보)
- `CharacterVirtual` 캡슐: 반지름 0.25 m, 전체 키 1.70 m(눈높이 1.60 m).
- `maxSlopeAngle` 50°, `stepUp` 0.40 m(연석 0.15–0.20 m, 일본 계단 챌면 ≤ 0.20 m), `stickToFloor` 0.5 m, 예측 접촉 거리 0.1 m.
- 속도: 걷기 1.35 m/s(도쿄 보행자 평균 근사), 빠른 걸음 1.8, 조깅 3.0, 달리기 5.0. 가속 8 m/s², 감속 10 m/s². 점프: 기본 OFF(설정에서 0.35 m 가능).
- **계단**: JCOL flags bit0 램프 프록시(렌더는 계단, 충돌은 경사면) → 부드러운 이동. 보폭 애니메이션은 렌더 계단 높이에 맞춤.
  램프 프록시 위 접지 중엔 수평 속도를 지면 평면에 올린다(수직 = −(n·h)/n_y — 접촉 투영만이면 오르막 수평 ≈ v·cos²θ, M05-T08 ADR-0056). 박스 연석·계단 모서리에는 하지 않는다.
- **에스컬레이터**: SENSOR 구간 진입 시 `EscalatorMode`: 경로 스플라인을 0.5 m/s로 이동(일본 기준 분속 30 m), 걸어서 오르기 허용(+0.6 m/s).
- **이동 발판(열차)**: 키네마틱 TRAIN 바디 위에서는 `GetGroundVelocity()`를 캐릭터 속도에 합산 → 달리는 열차 안에서 걷기 가능.
- 지면 재질 → 발소리(audio)로 전달 (`groundMaterial`).
- 구현(M04-T06, ADR-0046): `setFocus`(배선) → `rebase` 명령, 워커가 바디·캐릭터·구간 −Δ·앵커 제자리 갱신. groundMissing = traversal `ground-guard`(hold = 캐릭터 입력 `hold`, stop = 입력 0) + 게임 로딩 표시.
- 구현(M04-T05, ADR-0045): `sphereCast` = 워커 `CastShape`(구, 양면) — 3인칭 카메라 부채꼴 5개/프레임.
- 구현(M04-T04, ADR-0044): 에스컬레이터 = JCOL SENSOR 박스(flags bit2, 로컬 +Z = 진행 방향) OBB 목록 — 발이 안이면 진행 방향 0.5 m/s + 걷기 수평 ≤ 0.6 m/s, 스냅샷 `escalator`. 램프 프록시(bit0)·연석은 일반 정적 충돌면(프리미티브 박스 지원). 지형 재질 = asphalt(1) — `_SURF` 재질은 M05-T01.
- 구현(M04-T03, ADR-0043): 위치 = 발(캡슐 `mShapeOffset`), 스텝마다 가감속 → `ExtendedUpdate`(계단·바닥 붙기) → 물리 스텝. 스냅샷은 강체와 같은 슬롯 배치(flags GROUNDED, groundMat = 지면 바디 userData).

## 6. 차량 (승용차)
Jolt `WheeledVehicleController`. 일반 소형 세단(가상 모델) 기본값 — `content/vehicles/sedan.json`에 외부화:
| 항목 | 값 |
|---|---|
| 질량 / 치수 | 1,300 kg / 4.5 × 1.75 × 1.45 m, 휠베이스 2.64 m, 윤거 1.53 m, 무게중심 높이 0.50 m |
| 엔진 | 최대 토크 200 Nm, RPM 800–6500, 토크 곡선(정규화) [0:0.6, 0.25:0.85, 0.5:1.0, 0.8:0.95, 1:0.8] |
| 변속기 | 자동 6단 [3.30, 1.90, 1.30, 1.00, 0.80, 0.65], 후진 −3.0, 종감속 3.9, 변속 RPM 업 5500/다운 2000 |
| 서스펜션 | 스트로크 0.10–0.30 m, 주파수 1.5 Hz, 감쇠 0.5, 안티롤바 앞/뒤 |
| 타이어 | 반경 0.32 m, 폭 0.20 m, 종/횡 마찰 곡선(슬립 0.08에서 피크 1.0 → 1.0에서 0.8), 노면 젖음 시 마찰 ×0.7 |
| 조향 | 최대 35°, 속도 감응(100 km/h에서 40%) |
| 제동 | 브레이크 토크 1500 Nm, 핸드브레이크 뒤 4000 Nm, ABS(슬립 > 0.15 시 변조), TCS |
| 운전석 | **우핸들**, 좌측통행 |
- **비폭력·NPC 보호 규칙**: 보행자와 차량은 물리 충돌하지 않는다(레이어 행렬). 대신 전방 레이캐스트 기반 **자동 긴급제동(AEB)**: 보행자/자전거가 진행 경로 TTC < 1.5 s면 최대 제동. 보행자 AI는 차량을 회피(10-simulation.md).
- 교통 차량(NPC_KINEMATIC)과의 접촉: 플레이어 차량은 밀려나고, 교통 AI는 정지·양보. 손상 없음.
- **구현(M06-T06, ADR-0066)**: 열차와 같은 직결 — sim.worker가 틱마다 플레이어 60 m 안 차량 `KinematicFrame`(core: id·WF 바닥 중심·yaw·속력·치수)을 MessagePort로, 물리 워커 `worker/kinematics.ts`가 NPC_KINEMATIC 상자(바닥 틈 0.15 m)를 두고
  스텝마다 받은 포즈 + 속력 × 경과(≤ 0.25 s) 외삽 목표로 `MoveKinematic` → 도보 캐릭터(CharacterVirtual)는 접촉 속도로 밀린다(관통 없음, 단위 테스트 최소 간격 0.136 m). 열차(§8)의 보간 대신 외삽(차량은 등속 근사로 충분).

## 7. 자전거 (생활형 자전거)
- `MotorcycleController`(2륜, 기울기 제어). 차체 18 kg + 라이더 65 kg, 휠 반경 0.33 m.
- 구동 = 페달 토크 모델: `torque = pedal * clamp(1 − v / 7 m/s, 0, 1) * 60 Nm` (평지 최고 ≈ 24 km/h), 경사 저항은 중력으로 자연 발생.
- 최대 기울기 30°, 저속 안정 보조: v < 2 m/s면 롤을 스프링으로 세우고 정지 시 발 딛기(애니메이션 + 롤 잠금).
- 보도 주행: 일본 규정상 원칙 차도 좌측. 게임은 보도 허용하되 보행자 근접 시 자동 감속(서행 6 km/h).

## 8. 열차
- 열차는 **시뮬레이션(sim.worker)이 위치의 진실**. 각 차량 = TRAIN 키네마틱 바디(바닥·벽·천장 박스 합성 셰이프).
- sim.worker → physics.worker **직접 MessageChannel**로 sim 틱(30 Hz)마다 키네마틱 목표 전송 → 물리 워커가 120 Hz 스텝 사이를 보간해 매 스텝 `MoveKinematic(target, dt)`(목표 시각 = sim 타임스탬프 + 1틱, 1틱 지연 허용).
- 문 개폐 상태에 따라 출입구 벽 셰이프 on/off(서브셰이프 토글 대신 문 바디 별도).

## 9. 스냅샷 공유 (SAB)
```
Int32Array header[16]: [0]=writeIndex(0|1), [1]=seq, [2]=bodyCount, [3]=tickTimeUs(lo) ...
Float64Array bodies[2][MAX_BODIES=128][16]:
  posWF(3), quat(4), linVel(3), angVel(3), flags, groundMat, reserved
Float32Array wheels[2][MAX_VEHICLES=4][4 wheels][4]: rotAngle, steer, suspLen, slip
```
- 워커가 비활성 버퍼에 쓰고 `Atomics.store(writeIndex)` 교체. 메인은 직전/현재 스냅샷을 `alpha`로 보간.
- 폴백(비격리): 매 틱 `postMessage`(Transferable Float64Array).

## 10. 공개 API (`packages/physics/src/api.ts`)
```ts
export type BodyHandle = number & { __brand: 'BodyHandle' };
export interface CharacterInput { moveWF: Vec3 /* 원하는 수평 속도 m/s */; jump: boolean; }
export interface VehicleInput { throttle: number; brake: number; steer: number; handbrake: boolean; reverse: boolean; }
export interface Pose { posWF: Vec3d; quat: Quat; linVel: Vec3; grounded: boolean; groundMaterial: number; }
export interface PhysicsService extends SystemProvider {
  readonly ready: Promise<void>;
  readonly isolation: 'shared' | 'degraded';
  addCell(key: CellKey, originWF: Vec3d, jcol: ArrayBuffer, hf?: HeightfieldData): void;
  removeCell(key: CellKey): void;
  hasCell(key: CellKey): boolean;
  spawnCharacter(posWF: Vec3d, yaw: number): BodyHandle;
  spawnVehicle(kind: 'sedan' | 'bicycle', posWF: Vec3d, yaw: number): BodyHandle;
  despawn(h: BodyHandle): void;
  setCharacterInput(h: BodyHandle, i: CharacterInput): void;
  setVehicleInput(h: BodyHandle, i: VehicleInput): void;
  teleport(h: BodyHandle, posWF: Vec3d, yaw: number): void;
  pose(h: BodyHandle): Readonly<Pose>;                 // 보간 완료
  wheels(h: BodyHandle): ReadonlyArray<WheelState>;
  raycast(originWF: Vec3d, dir: Vec3, maxDist: number, mask: number): Promise<RayHit | null>;
  sphereCast(originWF: Vec3d, dir: Vec3, radius: number, maxDist: number): Promise<RayHit | null>; // 카메라 충돌
  connectKinematicSource(port: MessagePort): void;     // sim.worker 직결
}
export function createPhysics(deps: { bus: EventBus; log: Logger; config: PhysicsConfig }): PhysicsService;
```

## 11. 내부 파일 구성 (권장)
```
src/internal/host/        physics-host.ts, command-queue.ts, snapshot-reader.ts
src/internal/worker/      physics.worker.ts, jolt-init.ts, jolt-mem.ts, layers.ts, world.ts,
                          cell-colliders.ts, heightfield.ts, character.ts,
                          vehicle-sedan.ts, vehicle-bicycle.ts, kinematics.ts, queries.ts, snapshot-writer.ts
src/internal/protocol.ts  명령/응답 타입 (메인·워커 공용)
```
