# ADR-0071: 시간표 컴파일 — 합성(JR)·GTFS(긴자선) → global/timetables JSON, 주행 곡선은 core 공용 함수
- Status: Accepted (M07-T02)
- Date: 2026-10-05

## Context
M07-T02 Do: ODPT 도쿄메트로 GTFS → 긴자선 트립, 야마노테·사이쿄·쇼난신주쿠 합성 시간표(시간대별 간격·정차 시간), 운행일 04:00 경계.
Accept: 스키마 검증, 동일 선로 동일 방향 트립 간 최소 간격 ≥ 90 s. 10 §6.2: 위치 = 시각의 순수 함수 s(trip, t)(가속 0.83·감속 0.97 m/s², 구간 제한속도).
제약: JR동일본 ODPT 데이터는 상시 서비스 불가 라이선스(ADR-0008) → JR은 합성만. ODPT 키(`ODPT_CONSUMER_KEY`)는 아직 없다 — 키 값은 로그·파일·커밋 어디에도 남기지 않는다.
T03 수락(역간 소요 ±5 s, 시각 점프 ±0.1 m)은 컴파일러가 쓴 정차 시각과 sim이 그리는 운동이 **같은 곡선**이어야 쉽게 맞는다.

## Decision
1. **주행 곡선 = `@sanpo/core`**(L0 — 파이프라인·sim 둘 다 import 가능): `computeRunProfile(limits, step, s0, s1, vStart, vEnd)`(전진 가속·후진 감속 통과, 사다리꼴 시간),
   `profileAt(p, dt)`·`timeAtS(p, s)`(서로 역함수), `tripLegs(limits, step, from, to, stopS[])` — 시작이 첫 정차보다 앞이면 영역 밖에서 달려 들어옴(진입 속도 = 제한), 같으면 시발(0). 끝도 같다.
   컴파일러: 정차 i 도착 = 앞 출발 + 구간 곡선 시간, 출발 = max(고정 출발(GTFS), 도착 + 정차) — 0.1 s 반올림, 위치는 0.01 m 반올림 값으로 곡선을 만든다(sim이 파일 값으로 같은 곡선을 재구성).
2. **형식**(05 §9, `schemas/timetable.schema.json`, 타입 = tile-format `TimetableFile`): `global/timetables/<lineId>.json` = `{schema 1, line, source synthetic|gtfs, approximate, routes[{id,name,color}],
   calendars[{id, days[weekday|saturday|holiday], trips[{id, route, track, dir, cars, carLengthM, from, to, enterS, exitS, stops[{station, s, arrS, depS}]}]}]}` + `index.json`(노선 목록).
   시각 = 운행일 0시 기준 초(GTFS와 같음, 04:00 = 14400, 24:00 넘김), 트립 = 편성 중심이 선로 [from, to]를 지나는 구간. 10 §6.1 초안의 `trips[{id, dir, formation, stops}]`에 선로·범위·진입/퇴장을 더했다.
3. **합성**(`content/sim/synthetic-lines.json` — YAML 대신 JSON, ADR-0061과 같은 이유): 노선 → 계통(야마노테 / 사이쿄·쇼난신주쿠 = 화물선 공유) → 선로별 위상 + 시간대표(평일·휴일 간격),
   역별 정차. 진입 시각 = 편성이 선로 시작(from = 편성 반 길이)에 있는 시각. 같은 선로 계통들은 합쳐서 앞 열차와 120 s 미만이면 뒤로 민다(결정론). 요일 묶음 = 평일 / 토·휴일(근사).
4. **GTFS**(`rail-lines.json` 노선의 `gtfs{source, routes, originDwellS, terminalDwellS, minDwellS}`): route 이름이 맞는 트립 → 방향 = 첫 → 마지막 정류장 WF 벡터와 내적이 가장 큰 선로,
   정류장 이름(끝 "駅" 무시·부모 역)으로 우리 정차역 대조, 시발·종착이 우리 정차면 그 자리에서 나타남(출발 originDwell 전)·사라짐(도착 terminalDwell 뒤). calendar.txt 요일 열(없으면 service_id 이름 추정).
   원천 = `fetch --source odpt-tokyometro`(키 = 환경 변수, URL·오류 기록 금지) → `data/raw/odpt-tokyometro/*.zip` — 없으면 노선 'waiting-key'로 건너뛴다.
5. **검사**: 컴파일 시 스키마(ajv — 실패 = 예외), 같은 선로 이웃 트립 비교점(진입·역 도착/출발·퇴장)마다 뒤 − 앞 ≥ 90 s, 운행일(04:00–28:00) 안 — 위반은 `timetable-report.json`과 `validate` 오류.
   비교점 검사는 정차 패턴이 같은 트립끼리 정확(구간 곡선이 같다) — 통과·정차가 섞이는 급행이 생기면 구간 내부 표본 비교로 넓힌다.
6. **크레딧**: ATTRIBUTION `synthetic-timetables` — "근사 시간표(실제 시간표 아님)"를 3개 언어로 명시. GTFS 픽스처(`tests/fixtures/gtfs-mini`)는 가상 데이터.

## Consequences
- MVP rail.bin(T01) 위: 야마노테 1,132 트립(최소 간격 150 s), 화물선 626 트립(사이쿄 + 쇼난신주쿠, 최소 120 s), 위반 0, 운행일 밖 0. 파일 501 KB / 204 KB(gzip 43 KB / 17 KB).
- 역간 소요는 곡선 그대로라 실제(여유 시분 포함)보다 짧다(시부야 → 하라주쿠 91 s, 실제 ≈ 2분) — 근사. 필요하면 노선별 여유 계수(순항 속도 낮춤)를 곡선 입력에 더한다.
- 긴자선: 키 대기(PROGRESS). 키가 생기면 `ODPT_CONSUMER_KEY=… pnpm pipeline fetch --source odpt-tokyometro --update-lock` → `timetables --build-id` 또는 다음 빌드.
  종착(시부야) 도착 열차와 출발 열차는 서로 다른 선로 트립이라 승강장에서 바뀐다(차량 운용 block_id 미사용 — 시각 전용 노선이라 수용).
- sim `rail/timetable.ts`: 운행일 초·요일(운행일 기준)·운행 중 트립(오늘 + 전날 운행일). 공휴일 표는 아직 일요일만(M09).
