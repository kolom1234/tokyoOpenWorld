# @sanpo/sim
Layer: L3 | Depends: core, geo, tile-format(lanes·nav 파서), @recast-navigation/core 0.43.1(워커 전용 WASM), suncalc(태양·달) | Used by: apps/game

## Purpose
월드 시계·날씨·계절·POI(메인) + 군중·교통·신호·열차(sim.worker, 30 Hz). 출력: SAB 인스턴스 버퍼, 신호 상태, 열차 정보, 물리 키네마틱 목표(직결 포트).
상세: `docs/10-simulation.md` (API 전문 §8).

## Public API (요약)
`createSim(deps) → SimService`: `clock, weather, season, addCell, removeCell, setPlayer, connectPhysics, outputs, environment, signalStateAt, trainsNear, pois` (+ `SystemProvider`: phase 10/40).
**구현분(M03-T03)**: `createSim({ bus, log, now?, initialClock? })` → `{ clock: WorldClock(gameTimeMs, timeScale(frozen = 0), mode, dayType, setMode, setTimeScale, jumpTo), environment(): EnvironmentState, systems() }`.
`ClockMode = realtime | custom{startMs, scale 1|2|10|60} | frozen{atMs}`.
**M06-T01**: `startWorker({ supervisor, crowd: CrowdParams, centerWF }) → SharedInstanceBuffer | undefined`(sim.worker 30 Hz, SAB 이중 버퍼 — 필드 x,y,z(WF − anchor)·yaw·anim(클립 + 속력/10)·phase·variant(u16)·rate(주기/s), `tickAbsMs()` 추가), `workerStats()`.
`CrowdParams { gaitCycleM, idleLoopS, dummy{count, minRadiusM, maxRadiusM, idleShare, phoneShare} }`(content/sim/crowd.json — game이 넘김). ADR-0061.
**M06-T03**(ADR-0063): `startWorker({…, mode?: 'dummy'|'agents'})`(기본 agents — DetourCrowd tier A), `addCell(key, nav?)`(nav.bin gzip 해제 바이트, 시작 전이면 보관)·`removeCell(key)`·`crowdScenario(centerWF, radius, count)`(스크램블 시험),
`SimWorkerStats.p95TickMs`(최근 300틱)·`crowd{agents, waiting, crossing, plans, spawned, despawned, offMesh, stuck, tiles, cells, crossings}`, `CrowdParams.agents: CrowdAgentsParams{maxA, radiusA, despawnA, spawnMinDistM, speed, dest, plansPerTick, spawnsPerTick, reactionS, phoneShare, dwellShare, dwellS}`·`density{diurnal[24], hotspots[]}`.
시계 시스템(phase 10)이 플레이어(30 Hz)·시계(배속·점프·50 ms 어긋남)를 워커로 보낸다(worker/link.ts). environment = 카메라(phase 10에서 기록) 위치를 1 km 격자로 스냅해 태양·달·조도(맑은 하늘 근사)·계절 dayOfYear, 날씨는 맑음 고정(M06).

## Invariants
- 모든 난수 = 시드 기반(`hash32(WORLD_SEED, cellId, kind, idx)`), 같은 시각·장소 = 같은 풍경.
- 열차 위치는 시간의 순수 함수 `s(trip, t)`.
- 보행자는 차도를 횡단보도로만 건넘. 차량은 보행자 양보.
- 시각 기준: 운행일 경계 04:00 JST, 표시 Asia/Tokyo.
- 조정 파라미터는 `content/sim/*.json`(ADR-0061 — YAML 대신) (코드 상수 금지). sim은 콘텐츠 경로를 모른다(game이 읽어 넘김).
- 외형은 variant(u16)로만 넘긴다 — 베이스·밝기·키는 render가 고른다(에셋 무관).

## Files
clock/(world-clock — 모드·운행일 요일, astronomy — suncalc → 도북 → WF 벡터·조도; holidays는 M06), service(createSim·computeEnvironment), weather/, worker/(sim.worker, spatial-hash), crowd/(density, agents-detour, flow, lod-manager, appearance), traffic/(lane-graph, idm, routing, spawner, yielding), signals/(controller, plans), rail/(network, timetable, motion-profile, trains, doors), poi/.

## Gotchas
- suncalc 2.x는 **도(degree) 단위, 방위각은 북 기준 시계방향**(1.x와 다름). 결과 방위는 `geo.trueToGridAzimuthDeg`로 도북 보정.

## Tests
IDM 단일 차로 수렴, 신호 사이클, 운동 프로파일(시간 점프 일관성), 시간표 컴파일, 날씨 전이 확률 합=1, 공휴일 판정, 밀도 곡선.

## Status
M06-T03: `crowd/{nav-world, route, agent-fsm, agents-detour, agent-output, density}.ts` + `worker/{crowd-runtime, link}.ts` — 타일 NavMesh(WF, 64 m)·횡단 기록 참조 계수, tier A 상태 기계(걷기 → 접근 → 대기(보행 W·반응) → 횡단 → 재계획, 좌측 보행 차로), Recast WASM은 sim.worker 안에서만(ADR-0063).
M03-T03: 시계·천문·environment(ADR-0029). M06-T01: sim.worker + SAB + 더미 군중(ADR-0061). M06-T02: 신호 `signals/{plans,controller}.ts` — `SimDeps.signalPlans`(SignalPlansFile) → `signalStateAt(code)`: SignalState{vehicle G·Y·R, ped W·F·D, phase, remainingS, cycleS}, 게임 시각 순수 함수(ADR-0062). 내비메시·교통 = M06-T03~, 날씨·공휴일·열차 = M07·M09.

## Tests (구현분)
`test/crowd-agents.test.ts`(M06-T03 수락): world-mini 실데이터 스크램블 nav 64타일·신호 횡단, 횡단 띠로만 건너는 경로, 250명 적색 대기 → 녹색 동시 횡단 틱 p95 ≤ 12 ms·관통 0·내비 밖 0.
`test/crowd-worker.test.ts`: SAB 이중 영역 게시·front 뒤집기, 더미 결정론·원 궤도·접선 yaw·anim/rate 인코딩.
`test/clock.test.ts`: 2026-06-21 시부야 남중 11:43 JST 77.78°±0.1°·방위 180°, 12:00 ≈ 77.2°, 수렴각 보정, 시계 3모드, 04:00 운행일 경계, 환경 캐시.
