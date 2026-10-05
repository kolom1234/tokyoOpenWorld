# ADR-0063: 셀 내비메시(0.5 m 보행면 분류 → Recast 64 m 타일) + nav.bin(gzip, 횡단보도 기록) + tier A DetourCrowd 상태 기계
- Status: Accepted (M06-T03)
- Date: 2026-10-04

## Context
M06-T03 Do: 셀별 Recast 타일 굽기(64 m), 런타임 타일 추가/제거, 에이전트 목적지 선택, 신호 대기 정렬, 차량·플레이어 회피.
Accept: 스크램블 보행 현시에 에이전트 250명 동시 횡단 시 sim 틱 ≤ 12 ms, 관통 0. 04 §4.3은 "보도·횡단보도·광장 폴리곤 + 계단/육교 → Recast 타일(셀당 4×4), 반경 0.3 m",
05 §4는 `nav.bin` = Detour 타일 16개 연결(codec bin)만 정해 두었다. 차도를 가로지르는 곳은 횡단보도뿐이어야 하고(10 §4.2), 횡단은 보행 신호(ADR-0062 코드)를 따라야 한다.

## Decision
1. **보행면 분류**(`tools/pipeline/src/stages/derive/nav/surface.ts`): 셀 창(−2 … 258 m) **0.5 m 표본 스캔라인**(1 m 도로 래스터보다 경계 정확) —
   PLATEAU 보도·교통섬 = sidewalk(1), 횡단 띠(표시 횡단 = buildMarkings bands(보정·PLATEAU 대체 뒤) + 표시 없는 OSM crossing, **끝 1.5 m 연장** — OSM 선이 연석 앞에서
   끝나 띠와 보도가 좁은 틈으로만 이어지던 것 실측) 안 차도 = crossing(3), 차도 중 가장 가까운 OSM 도로가 생활도로(unclassified·residential·service·living_street…)이고
   간선(motorway–tertiary) 중심선에서 10 m 넘게(車道交差部 1020 안이면 25 m) 떨어짐 = street(2, 보차 공용 — 골목에 보도가 없는 도쿄), 도로 밖은
   OSM 보행 선(footway·path·pedestrian·steps·cycleway, 터널·교량·layer≠0 제외) 띠·보행 광장·공원 면(숲 제외)만 open(4). 건물 발자국·소품·나무 줄기 콜라이더(원기둥 = 원,
   상자 = 회전 사각형, +5 cm) = 없음. 높이 = 보도 윗면(roads.mesh와 같은 식) 또는 성형 지면. 간선 차도(나머지)는 걷지 않는다 → 건너는 길은 횡단 띠뿐.
2. **Recast 타일**(`derive/nav/recast-tile.ts`, recast-navigation 0.43.1 저수준 함수): 분류 사각형(2삼각형, area = 분류)을 타일 ± 테두리로 넣어
   복셀 0.2 × 0.05 m, 에이전트 반경 0.3·키 1.8·오름 0.25 m(연석 0.158 m), 영역 = watershed, 폴리곤 flags = area → walk(1)·cross(2).
   좌표 = **WF 그대로**(Detour 원점 0, 타일 = floor(WF / 64) — 셀 (ix, iz)의 타일 = (4ix + i, 4iz + j)). 일직선으로 이어진 OSM 횡단 조각(도로 가운데 꼭짓점 —
   스크램블 대각선)은 한 횡단으로 합친다(`build/nav-cell.ts mergeCollinear`).
3. **nav.bin v1 = bin+gzip**(05 §4 갱신 — 생산자가 없던 `bin`): `'NAVT'·u16 ver·u16 tileCount, {i16 tx, i16 tz, u32 len, 타일 바이트, 4바이트 정렬}…,
   u32 crossCount, {u32 id, f32 a[3], f32 b[3], f32 반폭, u32 보행 신호 코드|0xFFFFFFFF}…`. 신호 코드 = 소품 보행 신호기와 같은 signal-sites 규칙(같은 교차로·그룹 → 같은 박자).
   스키마 codec enum에서 `bin` 제거(쓰는 섹션 없음). MVP 3×3 셀당 66–161 KB, 빌드 +1–2 s/셀.
4. **런타임**(sim.worker): `crowd/nav-world.ts` 타일 NavMesh(타일 1024 × 폴리곤 4096 = 22비트) — 셀 nav addTile(DT_TILE_FREE_DATA)/removeTile, 횡단 기록 id 참조 계수.
   game `wiring/streaming-sim.ts`: live L0 셀 중 플레이어 256 m 안 → `requestSections(['nav.bin'])` → `sim.addCell(key, nav)`(워커 시작 전이면 보관, 재시작이면 사본 재전송), 320 m 밖 해제.
5. **tier A**(`crowd/agents-detour.ts` + `agent-fsm.ts` + `route.ts`): DetourCrowd(반경 0.3, 분리 1, 질의 범위 2.5 m, 회피·경로 최적화), 필터 0 = 걷기만, 1 = 횡단 포함.
   상태 = 걷기(목적지) → **접근**(전체 필터 경로의 첫 횡단 띠 → 진입 쪽 대기점) → **대기**(보행 램프 W까지, W 뒤 반응 0.2–1.6 s, F·D면 다시 뽑음) → **횡단**(필터 1, 띠 끝 너머
   첫 걷기 폴리곤) → 다시 계획. 대기·출구 가로 위치 = **좌측 보행 차로**(진행 방향 왼쪽 절반 — 양방향 흐름이 서로 막지 않게), 붐비면(4 m 안에서 1 s 막힘) 그 자리에서 대기.
   횡단 폴리곤 위에서 걷기 필터로 바꾸면 Detour가 에이전트를 INVALID로 만든다 → 횡단 완료 = 걷기 폴리곤에 섰을 때만. 스폰 = 플레이어 80 m 안 걷는 면(횡단 제외, 핫스팟 가중 수락,
   25 m 밖, 다른 에이전트 0.65 m 밖 — 겹쳐 태어나면 Detour 충돌 풀이가 겹친 채로 둔다), 95 m 밖 제거, 4 s 못 움직이면 다시 계획·12 s면 제거. 목표 수 = maxA 250 × JST 시간대 곡선.
   플레이어 = 조향 없는 에이전트(매 틱 순간이동 + 속도)라 보행자가 피한다. 결정론 = 스폰 순번 `hash32(WORLD_SEED, 'pedA', seq)` + Detour 난수 시드.
   출력 = ADR-0061 SAB 칸(클립은 실제 속력으로, yaw 초당 5 rad 회전 제한, 대기 중 = 건널 방향).
6. 게임 `?crowd=`: agents(기본) · dummy(T01) · scramble(agents + 스크램블 반경 45 m 신호 횡단 대기점 250명 — 수락 장면) · 0(끔). `?clock=run` = `?time=`부터 1배속.
   e2e 픽셀·물리 스펙은 `crowd=0`. world-mini 픽스처를 다시 빌드(nav.bin 포함, OSM 횡단 보정 적용 — 5.7 MB ≤ 6 MB).

## Consequences
- **수락(Node, world-mini 실데이터 스크램블)**: 250명 적색 대기 250 → 전방향 녹색에 **동시 횡단 250**, 틱 p95 1.6–1.7 ms·최대 3.3–5.2 ms ≤ 12 ✅,
  관통 0(에이전트 쌍 중심 < 0.3 m·내비 밖 위치 0, 15틱마다 40 s) ✅ — `packages/sim/test/crowd-agents.test.ts`(결정론이라 CI 재현).
- **실제 GPU**(RTX 3050 Laptop, Chrome WebGPU, 1600×900, 전력 상한 22–34 W·소비 17–19 W, 로컬 9셀 빌드 `?crowd=scramble`): 워커 틱 p95(10 s 창) **1.6–2.6 ms**,
  장면 생성 1회 30 ms, 60 FPS. 화면: 적색에 모서리 대기 무리 → W에 모든 횡단으로 흐름(docs/screenshots/M06/T03).
- 붐비는 횡단은 평균 ≈ 1 m/s(15–32 m + 출구) → 마지막 무리는 W 26 s + F 6 s 뒤에도 일부 건너는 중(서두름 × 1.35) — T07 튜닝.
- 차량 회피는 차선을 가로지르지 않는 것(횡단만)과 T05 양보 규칙으로. 교량·육교 위 보행면(overrides 상판)은 아직 내비에 없음(셀 경계 이웃 상판 필요).
- 생활도로 판정은 OSM 선 의존 — PLATEAU LOD1만 있는 간선 보도는 보행 불가(MVP 중심부는 LOD3). 핫스팟·대기 공간·방향 분포 튜닝 = T07.
