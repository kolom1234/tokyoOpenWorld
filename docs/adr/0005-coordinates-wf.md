# ADR-0005: World Frame on EPSG:6677 with render floating origin
- Status: Accepted
- Date: 2026-09-27

## Context
도쿄 23구 규모(±20 km)에서 float32 정밀도와 실측 좌표 일치가 모두 필요.

## Decision
평면직각좌표계 IX계(EPSG:6677) 기반 WF(원점 E0=−12000, N0=−37760), 렌더 원점 2048 m 재설정, 물리 앵커 4096 m 재설정. 게임 상태는 float64 보관.

## Consequences
변환은 @sanpo/geo 단일 구현. 원점 변경은 전체 리빌드.

## Alternatives
ECEF/ENU(구면 처리 불필요한 규모), Web Mercator(축척 왜곡).
