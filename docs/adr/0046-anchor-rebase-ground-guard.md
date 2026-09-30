# ADR-0046: 물리 앵커 재설정(setFocus)·발밑 셀 미적재 보호(hold/stop) (M04-T06)
- Status: Accepted
- Date: 2026-09-30

## Context
08 §2: 플레이어가 앵커에서 4096 m를 넘으면 모든 바디를 −Δ 옮기고 `OptimizeBroadPhase`. 08 §4: 발밑 셀 콜라이더가 없으면 `groundMissing` → 이동 일시 정지(낙하 방지).
수락 = 인위적 네트워크 지연(3G 스로틀)에서 낙하 0회. 물리 서비스는 플레이어를 모른다(01 §4 — 배선이 알려 줘야 한다).

## Decision
1. **`PhysicsService.setFocus(posWF)`**(배선 `streaming-physics` 250 ms마다 플레이어): 앵커에서 `rebaseDistanceM`(4096) 초과 → 앵커 = 초점의 1024 m 격자점, 명령 `rebase`.
   워커: 적재된 정적 바디(셀 콜라이더)·강체·캐릭터·에스컬레이터 구간을 −Δ, **앵커 객체를 제자리 갱신**(bodies·colliders·queries가 같은 객체를 읽어 남은 작업·레이도 새 앵커),
   `OptimizeBroadPhase`. 명령·스냅샷은 WF라 호출 측·보간은 모른다(재설정 순간에도 포즈 연속). stats `rebases`.
2. **발밑 보호**(traversal `ground-guard.ts`, walk 매 프레임): 발 아래 L0 셀(`geo.cellOf`)이 `hasCell`이 아니면 **hold**(캐릭터 입력 `hold` — 워커가 속도 0·ExtendedUpdate 생략 = 중력·이동 없음),
   원하는 방향·지금 속도 방향으로 제동 거리(v²/2·10 m/s²) + 0.6 m 앞 셀이 없으면 **stop**(입력 0). `hud.groundLoading` → 게임 `wiring/ground-loading.ts`가 0.2 s 넘게 이어지면
   화면 아래 "지면 불러오는 중…"(M08 HUD 전까지의 최소 표시). 월드 밖(데이터 없는 셀)도 같은 규칙으로 막힌다.
3. 작업 없는 셀(데이터 없음)은 enqueue 즉시 적재 완료(펌프가 pending 0이라 영영 미적재였던 잠재 버그).
4. 스로틀 검증 중 발견: 요청이 본문 도중 취소되면 복사본 본문 `cancel()`이 취소 사유로 거부 → **"signal is aborted without reason" 미처리 거부**(streaming fetcher) → 무시 처리,
   스케줄러 `run()`도 방어적으로 catch.

## Consequences
- 수락(실제 GPU, MVP `?world=local`, CDP **Fast 3G**(1.44 Mbps·562 ms)): 걷기 프레임 31,303 동안 **낙하 0**, 대기(정지·고정) 4회. 1.4–1.6 km 순간이동 = 공중 고정 → 17.6–18.6 s 뒤 착지.
  북쪽 끝(z −4200) = **앵커 재설정 1회**(0, 0, −4096) — 스로틀 없이 2.5 s에 셀 6개·착지, Fast 3G 단독 ≈ 32 s 뒤 착지(첫 L0 live ≈ 24 s).
- ⚠️ 순간이동을 여러 번 이어 하면 이전 목적지 작업이 스트리밍 큐(동시 8·대기 16)에 쌓여 스로틀에서 발밑 L0가 늦게 온다(3번째 뒤 북쪽 끝 4분+ 공중 고정 — 낙하는 없음).
  발밑 L0 우선·이전 목적지 취소는 M08 transition(`whenReady`)과 함께.
- Node 테스트: 재설정 전후 걷는 캐릭터 프레임 이동 연속·높이 유지·정적 바디 레이 WF 동일, hold = 바닥 없이 제자리 → 해제 시 낙하.
