# @sanpo/traversal
Layer: L3 | Depends: core, geo, input(api), physics(api) | Used by: apps/game

## Purpose
이동 모드 상태기계(walk/drive/cycle/train/freecam/transition), 모드별 의도→물리 명령, 카메라 리그, 상호작용 조회, 스트리밍 관심점 산출.
상세: `docs/09-traversal.md` (API 전문 §6).

## Public API (요약)
`createTraversal(ctx: TraversalContext) → TraversalService`: `mode, player, camera, interactables, request, teleport, register` (+ `SystemProvider`: phase 20/35).

## Invariants
- 모드 1개 = 파일 1개(`internal/modes/<id>.ts`), 레지스트리 등록으로 확장(기존 모드 수정 금지).
- 전환은 1프레임 내 원자적(exit → 핸들 교체 → enter → `mode/changed`).
- 카메라 출력은 항상 `CameraState`(WF float64).
- traversal은 render/sim을 직접 호출하지 않는다(출력만 제공, 배선은 apps/game). 열차 정보는 컨텍스트의 `trains()` 함수로만 받음.
- `physics`가 없으면(M04 이전) `requires: ['physics']` 모드는 진입 불가, freecam만 동작.

## Files
fsm.ts, modes/(walk, drive, cycle, train, freecam, transition), camera/(first-person-rig, third-person-rig, chase-rig, attached-rig, free-rig), interactables.ts, interest.ts, settings.ts.

## Tests
FSM 전환 표, 리그 스무딩 수치, 모드별 관심점 반경.

## Status
미구현 (M01-T06 freecam → M04, M07, M08).
