# @sanpo/input
Layer: L2 | Depends: core | Used by: traversal, apps/game

## Purpose
키보드·마우스(Pointer Lock)·게임패드를 액션 맵으로 추상화. 컨텍스트(walk/vehicle/fly/ui)별 활성 바인딩, 재바인딩.
상세: `docs/09-traversal.md §4`.

## Public API
```ts
createInput(deps: { target: HTMLElement; bus?: EventBus; log: Logger; bindings?: BindingMap; context?: InputContext }): InputService
InputService extends SystemProvider {   // system 'input', phase 0
  readonly state: ActionState; readonly context: InputContext; readonly pointerLocked: boolean; readonly gamepadConnected: boolean;
  setContext(c); rebind(a: Action, b: Binding, context?); bindings(): BindingMap; dispose();
}
ActionState { axis(a: AxisAction): number; pressed(a: ButtonAction): boolean; justPressed(a: ButtonAction): boolean }
InputContext = 'walk' | 'vehicle' | 'fly' | 'ui'
ButtonAction = sprint | pace | interact | toggleView | freeCam | map | photo | pause | handbrake | lights | skip   // skip = 열차 다음 역까지 빨리감기(T, vehicle 컨텍스트 — M07-T05)
AxisAction = moveX(오른쪽 +) | moveY(앞 +) | lookX(px, 오른쪽 +) | lookY(px, 아래 +) | fly(위 +) | wheel(노치, 위로 굴림 +)
Binding = {device:'key', code} | {device:'mouseButton', button} | {device:'keyAxis', negative, positive} | {device:'mouseAxis', axis:'x'|'y'|'wheel'}
        | {device:'padButton', button, hold?} | {device:'padAxis', axis, scale?, perSecond?} | {device:'padButtonAxis', negative, positive, scale?, perSecond?}   // 표준 매핑 번호
BindingMap = Record<InputContext, Partial<Record<Action, Binding[]>>>;  DEFAULT_BINDINGS (09 §4 표, 키보드·마우스·게임패드 — Select·Start 단독·Start+Y는 M08)
```

## Invariants
- 한 프레임 동안 `ActionState`는 불변(phase 0에서 스냅샷 — 원시 입력을 복사해 고정).
- 마우스 델타는 픽셀→라디안 변환을 여기서 하지 않음(감도는 traversal 설정). 휠은 노치(1 ≈ 100 px ≈ 3줄).
- UI 포커스(텍스트 입력) 중에는 게임 키 무시. Ctrl/Meta/Alt 조합 무시. 창 blur 시 눌림 해제.
- 프레임 사이에 눌렀다 뗀 탭도 `pressed`·`justPressed`로 잡는다. 키 반복은 `justPressed` 아님.
- 시점 회전은 Pointer Lock 중, 또는 마우스 버튼 드래그 중에만 누적(잠금이 거부되는 환경 대비). 캔버스 클릭 = 잠금 요청.
- 게임패드는 phase 0에서 폴링(첫 연결 패드, 표준 매핑 우선). 스틱 원형 데드존 0.15 → 0…1 재조정. 스틱·키 축은 합을 −1…1로 자르고, `perSecond` 패드 축(R스틱 시선 900 px/s 상당·D-pad 휠 4노치/s)은 × dt로 마우스 누적과 더한다. 버튼 눌림 = 값 > 0.5.

## Files
api.ts, internal/(raw-input — 원시 상태 순수 갱신, action-map — 스냅샷, default-bindings, service — createInput), internal/devices/(keyboard, mouse, gamepad — 폴링·데드존).
예정: 재바인딩 설정 저장(M08 settings).

## Tests
test/action-map.test.ts: 축(WASD/E/Q)·컨텍스트별 바인딩, 스냅샷 불변, justPressed 에지·반복·탭, 마우스·휠 누적·리셋, blur 해제, 편집 대상 판별.
test/gamepad.test.ts: 원형 데드존·재조정, 스틱 이동·R스틱 초당 시선, 버튼 에지, Select+Y 조합, 트리거 축, 연결 해제, 키+스틱 합 자르기.

## Status
M01-T06 최소(키보드·마우스·컨텍스트), M04-T03 게임패드(ADR-0043) → M08 설정 재바인딩 저장·UI 조합.
