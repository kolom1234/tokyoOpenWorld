# @sanpo/input
Layer: L2 | Depends: core | Used by: traversal, apps/game

## Purpose
키보드·마우스(Pointer Lock)·게임패드를 액션 맵으로 추상화. 컨텍스트(walk/vehicle/fly/ui)별 활성 바인딩, 재바인딩.
상세: `docs/09-traversal.md §4`.

## Public API
`createInput(deps: { target: HTMLElement; bus; log; bindings?: BindingMap }) → InputService`
`state: ActionState(axis, pressed, justPressed)`, `setContext`, `rebind`, `bindings` (+ `SystemProvider`: phase 0).

## Invariants
- 한 프레임 동안 `ActionState`는 불변(phase 0에서만 갱신).
- 마우스 델타는 픽셀→라디안 변환을 여기서 하지 않음(감도는 traversal 설정).
- UI 포커스(텍스트 입력) 중에는 게임 액션 비활성.

## Files
devices/(keyboard, mouse, gamepad), action-map.ts, contexts.ts, default-bindings.ts.

## Tests
액션 맵 해석, 컨텍스트 전환, justPressed 에지, 게임패드 데드존.

## Status
미구현 (M01-T06 최소, M04-T03 완성).
