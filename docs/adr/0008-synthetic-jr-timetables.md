# ADR-0008: JR lines use synthetic timetables
- Status: Accepted
- Date: 2026-09-27

## Context
JR동일본 ODPT 데이터는 '공공교통 오픈데이터 챌린지 한정 라이선스'로 상시 서비스에 사용 불가.

## Decision
야마노테·사이쿄·쇼난신주쿠는 시간대별 운행 간격 기반 합성 시간표(content/sim/synthetic-lines.yaml)를 사용하고 크레딧에 근사임을 명시. 도쿄메트로는 ODPT 기본 라이선스 GTFS 사용.

## Consequences
실제 시각과 차이 발생. 라이선스 획득 시 GTFS 컴파일러로 교체(포맷 동일).

## Alternatives
JR 데이터 무단 사용(기각).
