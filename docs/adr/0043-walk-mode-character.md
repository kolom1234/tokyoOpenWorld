# ADR-0043: 도보 — CharacterVirtual 슬롯 공유, 하늘 레이 착지, C 토글 규칙, 게임패드 바인딩 (M04-T03)
- Status: Accepted
- Date: 2026-09-30

## Context
08 §5·09 §1–4: 도보 = Jolt `CharacterVirtual` 캡슐(r 0.25, 키 1.70, 경사 50°, 계단 0.40 m, 바닥 붙기 0.5 m, 예측 0.1 m), 속도 단계 1.35/1.8/3.0 + 달리기 5.0, 가속 8·감속 10 m/s²,
FP/TP 리그, C = freecam ↔ 원래 모드(바디 정지 유지), 게임패드. 수락 = 스크램블 교차로 10분 자유 보행 끼임·낙하 0회, 걷기 1.35 m/s.
게임은 freecam(스폰 위 60 m)으로 시작하고 physics는 월드 로드 뒤 생긴다. PLATEAU 건물은 닫힌 셸(내부 바닥 없음)이라 건물 안·지붕에 놓이면 빠져나올 수 없다.

## Decision
1. **워커**: 캐릭터는 바디가 아니지만 강체와 같은 슬롯·핸들·스냅샷 배치를 쓴다(`bodies.ts` Entry = rigid | char). 위치 = 발(캡슐은 `mShapeOffset`으로 위로), 스냅샷 flags GROUNDED(OnGround·OnSteepGround),
   groundMat = 지면 바디 userData(셀 콜라이더 재질). 스텝마다 `ExtendedUpdate`(계단·바닥 붙기) 전에 원하는 수평 속도로 가감속(8/10), 지면이면 수직 = 지면 속도 + 중력 1스텝, 아니면 중력 누적.
   삼각형 양면(`CollideWithBackFaces`, ADR-0042 원칙), `mEnhancedInternalEdgeRemoval`. 점프는 08 §5 기본 OFF라 입력만 받고 무시.
2. **명령**: `spawnCharacter(posWF, yaw)`, `setCharacterInput(h, { moveWF, jump?, yawRad? })` — 입력은 같은 프레임 여러 번이면 마지막 것만(큐에서 교체).
3. **착지(walk-placement)**: 기준점(보통 직전 카메라) 중심 + 6·12·24·48 m 링 × 8방위 후보마다 **하늘(y 1,200)에서 수직 레이** → 첫 충돌이 TERRAIN인 첫 후보에 발을 놓는다(+2 cm).
   지붕·건물 셸 안·고가 아래는 첫 충돌이 건물이라 자동 제외. 콜라이더가 아직 없으면 0.5 s마다 재시도(카메라는 기준점에서 대기).
4. **C 토글**: freecam → 직전 모드(없으면 **walk**). 전환 파라미터 = 지금 카메라 포즈 — freecam은 그 자리에서 시작, walk는 바디가 카메라에서 수평 **150 m 안이면 바디로 복귀**(09 §1 "원래 모드로 복귀"),
   멀면 카메라 아래에 새로 놓는다(바디 셀 콜라이더는 물리 반경 밖에서 해제되므로 먼 바디로 돌아가지 않는다). 도착 피치는 ±20°로 제한.
5. **FSM 요구조건은 요청 때마다 평가**: traversal 컨텍스트의 `physics`는 getter(월드 로드 뒤 생김) — 그 전 C는 무시(freecam 유지).
6. **카메라**: FP = 발 + 1.60 m(발 높이 변화는 지면 위 0.6 m 이하면 12/s 지수 추종 — 연석 계단 튐 완화, 공중·큰 변화는 즉시) + 헤드밥(걸음 주기 = 속도/0.7 m, ≤ 3 Hz; 수직 1.2 cm·측면 0.6 cm × 속도/1.35 ≤ 1.5배),
   시선 스무딩 30 ms. TP = 발 + 1.55 m 피벗, 오른쪽 어깨 0.4 m, 거리 3.5 m(휠 1.5–6, 노치당 ×0.85), 지면 + 0.3 m 아래 금지 — sphereCast 충돌·아바타 디더는 M04-T05.
   TP에서 몸 방향 = 진행 방향(0.1 m/s 이상), FP = 시선.
7. **게임패드**(input): Gamepad API 폴링(phase 0, 첫 연결 패드·표준 매핑 우선), 스틱 원형 데드존 0.15 재조정, 바인딩 `padButton{hold?}`·`padAxis{scale, perSecond}`·`padButtonAxis`.
   R스틱 시선 = 900 px/s 상당(감도 0.0025 rad/px → 2.25 rad/s, 마우스 누적과 합), D-pad ↑↓ = 휠 4노치/s. Select+Y = freecam(조합). Select·Start 단독(지도·일시정지)·Start+Y(포토)는 조합 충돌 규칙과 함께 M08.

## Consequences
- 수락(실제 GPU, MVP 재빌드 20260929-99bffa8-ec1646fc, `?world=local`): 결과는 PR #16·PROGRESS에 기록.
- 게임 시작 모드는 freecam 유지(골든뷰·e2e 결정론) — 사용자는 C로 걷기 시작(09 §1 "walk = 기본"과 차이, M08 메뉴/스폰 흐름에서 재검토). **→ ADR-0047(2026-09-30)로 대체: 시작 = walk.**
- 연석·계단·에스컬레이터(M04-T04), 카메라 충돌·아바타(M04-T05), 발밑 셀 미적재 정지(M04-T06)는 후속.
