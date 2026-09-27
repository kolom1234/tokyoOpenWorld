# 09 — Traversal, Input & Camera (`@sanpo/traversal`, `@sanpo/input`)

## 1. 이동 모드 상태기계
```
            ┌──────── F(차량 승차) ───────►  drive  ──F(하차)──┐
            │                                                    ▼
 freecam ◄─C─►  walk(FP/TP)  ◄──────────────── (하차 지점 보도로 이동) ─┘
            │        │   ▲
            │        │   └── 문 열림 + 출입구 통과 ── train(standing/seated/frontView)
            │        └── 열차 내부 센서 진입 ──────────►
            └──────── F(자전거) ──► cycle ──F──► walk
 transition: 빠른 이동/순간이동 전용 (페이드 → whenReady → 복귀 모드)
```
| ModeId | 진입 조건 | 이탈 |
|---|---|---|
| `walk` | 기본 | 다른 모드 진입 |
| `drive` | 차량 상호작용(카셰어 스팟 / 편의모드 "차 부르기": 인접 차도 가장자리에 스폰) | F: 운전석 쪽(오른쪽) 보도로 하차. 차량은 30 s 후 디스폰 |
| `cycle` | 공유자전거 독(역 주변 파이프라인 배치) / 편의모드 소환 | F |
| `train` | 캐릭터가 열차 내부 센서 안 + 열차 정차 중 | 정차 중 출입구 밖으로 나가면 `walk` |
| `freecam` | C 키 (어디서나) | C: 원래 모드로 복귀(플레이어 바디는 정지·유령 상태 유지) |
| `transition` | 지도에서 발견한 역으로 빠른 이동, 설정 변경 후 리스폰 | 로딩 완료 |

- 모드는 `TraversalMode` 구현체 1개 = 파일 1개(`src/internal/modes/<id>.ts`). 새 모드 추가 시 기존 모드 수정 금지(레지스트리 등록만).
- 모드 전환은 1프레임 안에 원자적으로: `exit(from)` → 물리 핸들 교체 → `enter(to)` → `mode/changed` 발행.

## 2. 모드별 동작
### walk
- 1인칭(기본) ↔ 3인칭(V). 이동 입력 → 카메라 yaw 기준 수평 속도 → `setCharacterInput`.
- 걸음 속도: `Pace` 액션(X 키)으로 기본 보조 걸음을 순환 — 걷기 1.35 → 빠른 걸음 1.8 → 조깅 3.0 m/s. `Sprint`(Shift 유지) = 달리기 5.0 m/s. 게임패드는 스틱 기울기 크기로 연속 조절(최대 = 현재 Pace). 가속 곡선은 08-physics §5.
- 신호 대기 보조: 횡단보도 앞에서 적신호면 HUD 힌트(강제 정지 없음).
- 상호작용 프롬프트: 반경 2 m 내 `Interactable`(좌석, 자전거 독, 카셰어, 개찰구, 전망 포인트) 중 시선각 가장 가까운 것.
### drive
- 입력: 스로틀/브레이크(아날로그), 조향(키보드는 속도 감응 램프), 핸드브레이크, 후진, 헤드라이트(L), 방향지시등(Q/E, 교통 AI에 신호로 전달).
- 카메라: 추적(기본, 거리 5.5 m, 높이 1.6 m, 스프링 지연) / 보닛 / 운전석(우측 좌석 시점, 계기판 표시).
- 속도 보조(옵션): 제한속도 표시, 크루즈.
### cycle
- 페달(W), 브레이크(S), 조향(A/D), 벨(B). 카메라: 추적 / 1인칭.
### train
- 하위 뷰: `standing`(캐릭터가 차내에서 이동), `seated`(좌석 상호작용), `frontView`(선두차 전면 전망 시점, 일본 前面展望 스타일).
- "다음 역까지 빨리감기"(T): 페이드 → 월드 시계 점프 → 열차 위치를 시간표 기준 재배치 → 도착 직전 복귀.
- 차내 안내: 자체 제작 차임 + 텍스트 표시(LCD 풍, 다국어), 실제 안내방송 음성 사용 금지.
### freecam (드론/포토)
- 6DOF 관성 이동, 속도 휠 조절(0.5–60 m/s), 상승/하강(E/Q), 롤 잠금, 고도 상한 1,000 m.
- 충돌: 기본 soft(sphereCast로 밀어냄), 설정에서 끄기 가능.
- P: 포토모드 UI(12-ui-ux.md §5)로 전환 — 시간 정지·스크럽 가능.

## 3. 카메라 리그 (`src/internal/camera/`)
| 리그 | 파라미터 |
|---|---|
| `FirstPersonRig` | 눈높이 1.60 m, FOV 기본 70°(설정 55–95), 헤드밥 수직 1.2 cm·측면 0.6 cm(끌 수 있음), 룩 스무딩 30 ms |
| `ThirdPersonRig` | 어깨 오프셋 0.4 m, 거리 3.5 m(휠 1.5–6), sphereCast 충돌, 가까우면 아바타 디더 페이드 |
| `ChaseRig` | 차량 뒤 5.5 m·위 1.6 m, 위치 스프링 ω=6, 회전 지연, 고속 시 FOV +5° |
| `AttachedRig` | 차량 보닛/운전석/열차 전면: 부모 바디 로컬 오프셋 + 미세 진동(서스펜션 가속도 기반) |
| `FreeRig` | 관성(감쇠 3/s), 시네마틱 스무딩 옵션 |
- 모든 리그 출력은 `CameraState { posWF: Vec3d; quat; fovDeg; near }` → render.setCamera + streaming 관심점.

## 4. 입력 (`@sanpo/input`)
- 디바이스: 키보드·마우스(Pointer Lock), 게임패드(Gamepad API 표준 매핑).
- 액션 맵(재바인딩 가능, 설정에 저장). 컨텍스트별 활성: `walk`, `vehicle`, `fly`, `ui`.
| 액션 | 키보드/마우스 | 게임패드 |
|---|---|---|
| Move | WASD | L스틱 |
| Look | 마우스 | R스틱 |
| Sprint | Shift(유지) | L3 |
| Pace(걸음 단계 순환) | X | 스틱 기울기 |
| Interact | F | X(□) |
| ToggleView | V | R3 |
| FreeCam | C | Select+Y |
| Map | M | Select |
| Photo | P | Start+Y |
| Pause | Esc | Start |
| Throttle / Brake | W / S | RT / LT |
| Steer | A / D | L스틱 X |
| Handbrake | Space | A |
| Lights / Indicators | L / Q·E | D-pad |
| Fly up / down | E / Q | RB / LB |
```ts
export interface ActionState { axis(name: AxisAction): number; pressed(a: ButtonAction): boolean; justPressed(a: ButtonAction): boolean; }
export interface InputService extends SystemProvider { readonly state: ActionState; setContext(c: InputContext): void; rebind(a: Action, b: Binding): void; bindings(): BindingMap; }
```

## 5. 상호작용 시스템
- `InteractableRecord`(tile-format, = cell-meta 스키마 항목: `id, kind, posLocal, yaw?, radius`) → 레지스트리가 `Interactable { id; kind; posWF; yaw; radius; prompt: I18nKey }`로 변환(`prompt = 'interact.' + kind`).
- 소유: **traversal의 `InteractableRegistry`**(`internal/interactables.ts`). 출처: 셀 meta `interactables[]`(파이프라인 생성: 카셰어·자전거 독·개찰구·전망 포인트) → wiring이 `traversal.interactables.addCell(key, originWF, list)`; 열차 좌석/문은 sim `trainsNear()` 결과로 traversal이 매 프레임 동적 갱신. 공간 해시(32 m 버킷).
- 개찰구: 통과 시 IC 카드 효과음(자체 합성)과 게이트 플랩 애니메이션만. 요금 시스템 없음.

## 6. 공개 API (`packages/traversal/src/api.ts`)
```ts
// ModeId, TrainInfo, InterestPoint, I18nKey는 @sanpo/core, InteractableRecord는 @sanpo/tile-format에서 import
export interface TraversalContext { physics?: PhysicsService /* M04 전까지 없음: freecam만 동작 */; input: InputService; bus: EventBus; ground: GroundQuery; trains?: () => ReadonlyArray<TrainInfo>; }
export interface HudHints { promptKey?: I18nKey; speedKmh?: number; nextStationId?: string; gear?: string; rpm?: number; }
export interface ModeOutput { camera: CameraState; interest: InterestPoint[]; hud: HudHints; }
export interface InteractableRegistry { addCell(key: CellKey, originWF: Vec3d, list: ReadonlyArray<InteractableRecord>): void; removeCell(key: CellKey): void; nearest(posWF: Vec3d, forward: Vec3, maxDist: number): Interactable | null; }
export interface TraversalMode { readonly id: ModeId; readonly requires: ReadonlyArray<'physics' | 'trains'>; enter(ctx: TraversalContext, from: ModeId, params?: unknown): void;
  update(frame: FrameContext, ctx: TraversalContext): ModeOutput; exit(ctx: TraversalContext, to: ModeId): void; }
export interface TraversalService extends SystemProvider {
  readonly mode: ModeId; readonly player: Readonly<PlayerState>; readonly camera: Readonly<CameraState>;
  readonly interactables: InteractableRegistry;
  request(to: ModeId, params?: unknown): boolean;   // requires 미충족 모드는 false
  teleport(posWF: Vec3d, yaw: number): Promise<void>;
  register(mode: TraversalMode): void;
}
```
