# ADR-0041: 물리 워커 부트스트랩 — 메인 구동 고정 스텝, SAB seqlock 스냅샷, Jolt single-thread (M04-T01)
- Status: Accepted
- Date: 2026-09-30

## Context
08 §1·§9: Jolt 1.1.0을 전용 워커에서, 120 Hz 고정 스텝(틱당 최대 4), SAB 더블 버퍼(격리) / postMessage 폴백(비격리), 격리면 multithread 빌드.

## Decision
1. **메인이 스텝을 구동**: 시스템 'physics'(phase 30)가 프레임마다 `{t:'step', targetS = 메인 시계, cmds}`를 보내고, 워커는 simT + dt ≤ targetS인 동안 스텝(최대 4, 초과 시간은 버림).
   워커가 자기 타이머로 돌지 않으므로 탭이 숨으면 멈추고, 메인·워커 시계 원점 차이(timeOrigin)가 문제되지 않는다. 명령은 첫 스텝 전에 적용.
2. **스냅샷**: 헤더 Int32[16](writeIndex·seq) + 버퍼 2개 × (메타 f64[8] + 바디 128 × 16). 워커는 비활성 버퍼에 쓰고 writeIndex 교체 → seq 증가.
   메인은 **seqlock**(복사 전후 seq 차 ≥ 2면 재시도)으로 최신 버퍼를 복사. 폴백은 같은 한 버퍼(Float64Array)를 Transferable로.
   바디 기록 = posWF(3)·quat(4)·linVel(3)·angVel(3)·flags·groundMat·handle — handle로 재사용 슬롯의 옛 핸들을 거른다(핸들 = 슬롯 | 세대 << 7).
3. **보간**: 최근 6개 프레임(같은 simT면 교체)에서 렌더 시각 = 지금 − (1/60 + 1/120) s를 감싸는 두 프레임을 선형(위치·속도)·nlerp(회전). 10 m 이상 차이는 순간 이동으로 보고 보간하지 않는다.
4. **Jolt single-thread(wasm-compat)만** — 08 §1 이탈. multithread 빌드는 pthread 워커를 자기 파일로 띄우는데 Vite가 그것을 중첩 워커(iife)로 번들하다
   최상위 await에서 **프로덕션 빌드가 실패**하고, 개발 서버에서도 초기화 ≈ 3 s(single ≈ 85–90 ms). 부하(캐릭터 1 + 정적 월드)는 틱 ≈ 0.05 ms라 스레드 이득이 없다.
   차량·교통 키네마틱이 늘어 틱이 커지면 재검토(별도 청크로 multithread 파일을 정적 복사해 URL로 로드하는 방법).
5. Vite `worker.format = 'es'`(모든 워커가 모듈 워커).
6. 수락용 디버그 API `debugSpawnBox(posWF, halfExtent, dynamic)`(dynamic = VEHICLE 레이어, static = STATIC_WORLD). 게임 `?probe=physics`(+`&physicsIsolation=degraded`).
7. 워커 코어(`worker/core.ts`)는 전송과 분리 → Node 테스트는 같은 스레드 전송으로 SAB·폴백 둘 다 실제 Jolt로 검증.

## Consequences
- 수락: Node 통합(SAB·폴백) — 스냅샷 시각에서 보간 포즈 = 워커 값(정확히), 두 스냅샷 사이 = 선형, 3 s 뒤 바닥 위 0.48 m 정지. 브라우저 e2e(프로덕션 preview, 격리):
  shared·degraded 모두 초기화 84–90 ms, 3 s에 스텝 359–360(= 120 Hz), 틱 0.03–0.07 ms, 메인 긴 작업 0.
- SAB 모드는 워커보다 한 프레임 늦게 읽는다(보간 지연 25 ms 안).
- 워커 재시작 시 바디는 사라진다(경고 + re-init). 캐릭터 재생성은 traversal(M04-T03)이 맡는다.
