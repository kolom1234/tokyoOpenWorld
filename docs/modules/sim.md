# @sanpo/sim
Layer: L3 | Depends: core, geo, tile-format(lanes 파서), recast-navigation, suncalc(태양·달) | Used by: apps/game

## Purpose
월드 시계·날씨·계절·POI(메인) + 군중·교통·신호·열차(sim.worker, 30 Hz). 출력: SAB 인스턴스 버퍼, 신호 상태, 열차 정보, 물리 키네마틱 목표(직결 포트).
상세: `docs/10-simulation.md` (API 전문 §8).

## Public API (요약)
`createSim(deps) → SimService`: `clock, weather, season, addCell, removeCell, setPlayer, connectPhysics, outputs, environment, signalStateAt, trainsNear, pois` (+ `SystemProvider`: phase 10/40).

## Invariants
- 모든 난수 = 시드 기반(`hash32(WORLD_SEED, cellId, kind, idx)`), 같은 시각·장소 = 같은 풍경.
- 열차 위치는 시간의 순수 함수 `s(trip, t)`.
- 보행자는 차도를 횡단보도로만 건넘. 차량은 보행자 양보.
- 시각 기준: 운행일 경계 04:00 JST, 표시 Asia/Tokyo.
- 조정 파라미터는 `content/sim/*.yaml` (코드 상수 금지).

## Files
clock/(world-clock, holidays, day-type, astronomy), weather/, worker/(sim.worker, spatial-hash), crowd/(density, agents-detour, flow, lod-manager, appearance), traffic/(lane-graph, idm, routing, spawner, yielding), signals/(controller, plans), rail/(network, timetable, motion-profile, trains, doors), poi/.

## Gotchas
- suncalc 2.x는 **도(degree) 단위, 방위각은 북 기준 시계방향**(1.x와 다름). 결과 방위는 `geo.trueToGridAzimuthDeg`로 도북 보정.

## Tests
IDM 단일 차로 수렴, 신호 사이클, 운동 프로파일(시간 점프 일관성), 시간표 컴파일, 날씨 전이 확률 합=1, 공휴일 판정, 밀도 곡선.

## Status
미구현 (M03-T03 시계 → M06, M07, M09).
