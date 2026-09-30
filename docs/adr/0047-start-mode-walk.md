# ADR-0047: 게임 시작 모드 = walk(09 §1 기본), freecam은 C·`?mode=freecam`·골든뷰 (M05 결정 1)
- Status: Accepted (ADR-0043 "시작은 freecam" 대체)
- Date: 2026-09-30

## Context
09 §1은 walk를 기본 모드로 정했지만 M04-T03(ADR-0043)은 골든뷰·e2e 결정론과 "physics가 월드 로드 뒤 생긴다"는 이유로 freecam(스폰 위 60 m)에서 시작했다.
M04에서 발밑 보호(ADR-0046)·착지점 탐색(TERRAIN 레이 링)이 갖춰졌고, 사용자가 설계대로 walk 시작을 결정했다(2026-09-30).

## Decision
1. 로딩 중(physics 없음)은 freecam 시작 시점을 그대로 쓰고, `showWorld`가 스폰 영역 `whenReady` 뒤 **walk를 요청**한다:
   기준점 = world.json `spawn.posWF` xz, 눈높이 = 지면 + 1.6 m(착지점 레이가 도는 동안 카메라가 그 자리에서 기다림), 방위 = `spawn.yawDeg`(0 = 북), 피치 0.
   착지점은 walk가 스폰 주변 링(6·12·24·48 m × 8방위)에서 TERRAIN을 찾는다(콜라이더 미적재면 0.5 s마다 재시도).
2. freecam 시작이 필요한 곳: 골든뷰(`?view=` — 결정론 포즈), **`?mode=freecam`**(렌더 e2e·비교: `render.spec`·`flicker.spec`). C 토글은 그대로(freecam ↔ 직전 모드).
3. streaming `initialMode` = 그 시점 traversal 모드(로딩 중 freecam) — walk 전환은 `mode/changed`로 전달된다.

## Consequences
- e2e `walk.spec`은 C 없이 부트 → walk 착지 → 걷기 → V → C 왕복. 물리 없는 환경(워커 실패)에서는 walk 요청이 거부되어 freecam에 남는다(기존 요구조건 평가).
- 첫 화면이 스크램블 교차로 눈높이 보행 시점이 된다(M08 스폰 흐름·메뉴에서 시작 위치 선택이 생기면 같은 경로 사용).
