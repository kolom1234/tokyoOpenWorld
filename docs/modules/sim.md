# @sanpo/sim
Layer: L3 | Depends: core, geo, tile-format(lanes 파서), recast-navigation, suncalc(태양·달) | Used by: apps/game

## Purpose
월드 시계·날씨·계절·POI(메인) + 군중·교통·신호·열차(sim.worker, 30 Hz). 출력: SAB 인스턴스 버퍼, 신호 상태, 열차 정보, 물리 키네마틱 목표(직결 포트).
상세: `docs/10-simulation.md` (API 전문 §8).

## Public API (요약)
`createSim(deps) → SimService`: `clock, weather, season, addCell, removeCell, setPlayer, connectPhysics, outputs, environment, signalStateAt, trainsNear, pois` (+ `SystemProvider`: phase 10/40).
**구현분(M03-T03)**: `createSim({ bus, log, now?, initialClock? })` → `{ clock: WorldClock(gameTimeMs, timeScale(frozen = 0), mode, dayType, setMode, setTimeScale, jumpTo), environment(): EnvironmentState, systems() }`.
`ClockMode = realtime | custom{startMs, scale 1|2|10|60} | frozen{atMs}`. environment = 카메라(phase 10에서 기록) 위치를 1 km 격자로 스냅해 태양·달·조도(맑은 하늘 근사)·계절 dayOfYear, 날씨는 맑음 고정(M06).

## Invariants
- 모든 난수 = 시드 기반(`hash32(WORLD_SEED, cellId, kind, idx)`), 같은 시각·장소 = 같은 풍경.
- 열차 위치는 시간의 순수 함수 `s(trip, t)`.
- 보행자는 차도를 횡단보도로만 건넘. 차량은 보행자 양보.
- 시각 기준: 운행일 경계 04:00 JST, 표시 Asia/Tokyo.
- 조정 파라미터는 `content/sim/*.yaml` (코드 상수 금지).

## Files
clock/(world-clock — 모드·운행일 요일, astronomy — suncalc → 도북 → WF 벡터·조도; holidays는 M06), service(createSim·computeEnvironment), weather/, worker/(sim.worker, spatial-hash), crowd/(density, agents-detour, flow, lod-manager, appearance), traffic/(lane-graph, idm, routing, spawner, yielding), signals/(controller, plans), rail/(network, timetable, motion-profile, trains, doors), poi/.

## Gotchas
- suncalc 2.x는 **도(degree) 단위, 방위각은 북 기준 시계방향**(1.x와 다름). 결과 방위는 `geo.trueToGridAzimuthDeg`로 도북 보정.

## Tests
IDM 단일 차로 수렴, 신호 사이클, 운동 프로파일(시간 점프 일관성), 시간표 컴파일, 날씨 전이 확률 합=1, 공휴일 판정, 밀도 곡선.

## Status
M03-T03: 시계·천문·environment(ADR-0029). 날씨·공휴일·군중·교통·열차는 M06·M07·M09.

## Tests (구현분)
`test/clock.test.ts`: 2026-06-21 시부야 남중 11:43 JST 77.78°±0.1°·방위 180°, 12:00 ≈ 77.2°, 수렴각 보정, 시계 3모드, 04:00 운행일 경계, 환경 캐시.
