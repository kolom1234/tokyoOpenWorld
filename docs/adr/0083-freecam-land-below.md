# ADR-0083: freecam G = 카메라 아래에 내리기(안전 판정은 게임, 전환은 traversal) + 임시 조작 도움말 HUD
- Status: Accepted (M09·M07 사람 확인 후속)
- Date: 2026-10-13

## Context
staging 확인: freecam으로 승강장 위를 날다가 C를 누르면 원래 몸 위치로 순간이동한다(ADR-0043 — C = 몸으로 복귀, 150 m 밖이면 카메라 아래 "하늘 레이 첫 면이 TERRAIN"인 곳).
탐방용으로 "지금 보는 곳 바로 아래에서 걷기"가 필요하다. 하늘 레이 규칙은 승강장(차양 아래·STATIC)·보도 데크를 못 고르고, 차도 한가운데·선로를 거르지 않는다. 조작 안내 HUD도 없었다.

## Decision
1. **입력**: `ButtonAction 'land'` — fly 컨텍스트 G·패드 A. C(몸으로 복귀)는 그대로.
2. **traversal**: freecam이 G에서 `TraversalContext.landing(카메라 WF)`(게임 제공)을 부르고, 결과 `{ ok, posWF }`면 다음 프레임 `next: walk { exact: true, yaw = 카메라 }`,
   실패면 `hud.landing = { seq, state: 'failed', reason }`(`LandingFailReason` = not-ready·no-ground·building·track·road·blocked·steep). 시도마다 seq 증가, 모드를 나가면 늦은 결과는 버린다.
3. **게임 판정**(`apps/game/src/landing.ts`): 가운데 + 2·4·7 m 링 × 8방위 후보를 함께 판정 → 가까운 순 첫 안전 자리(없으면 가운데 이유). 후보마다
   아래로 첫 걸을 수 있는 면(지면 TERRAIN·승강장 윗면 — 지붕·차양·데크는 최대 4겹 아래로 지나감, 차량 = road, 열차 = track) →
   경사(법선 y < 0.8) → 승강장이면 가장자리 0.8 m 여유, 아니면 선로 회랑(±2.2 m, 레일 ±1.6 m)·구덩이 → 차선(셀 `lanes.bin` 지연 적재·16셀 캐시, 일반 차선 폭/2 + 0.6 m·교차로 연결로 + 3.5 m — 보도 tile 메시는 제외)
   → 건물 안(머리 위 덮임 + 수평 8방위 중 7곳 25 m 안 막힘) → 머리 공간(구 0.3 m, 발 위 0.35 → 1.8 m) 순.
4. **HUD**(`apps/game/src/help-hud.ts`, 임시 DOM — M08 대체): 왼쪽 아래 모드별 조작(walk·freecam·train + 볼륨), H로 접기, G 진행("내릴 곳 찾는 중…")·실패 이유 알림.

## Consequences
- 실제 GPU: 하라주쿠 승강장 위 45 m·차양 아래 2 m·신주쿠 승강장 → 승강장 윗면, 스크램블 한가운데 → 7 m 안 보도, 하치코 광장·메이지도리 옆 → 그 자리.
- 차선 데이터가 없는 골목 차도는 차도로 보지 않는다(OSM lanes 의존). 물 위·공원 연못 판정 없음(MVP 데이터에 수면 콜라이더 없음).
- 후보 25개 × 레이 ≤ 14 — 물리 워커 응답 몇 틱(≈ 0.1 s). 메인 스레드 작업은 차선 거리 계산(셀당 수천 점)뿐.
