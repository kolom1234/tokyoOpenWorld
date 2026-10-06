# PROGRESS
Updated: 2026-10-06 (session #20 — 큐 모드 ⓪ 버그 → ① M06 잔여 → ② M07 T01–T05 완료, 브랜치 `claude/m07-trains`, draft PR #20)

## Current Milestone: M07 — Trains (T01–T05 ✅ · T06 보류 = M09-T04 오디오 코어 의존) → 다음 M08 Vehicles
## Current Task: M07 T01–T05 ✅(PR #20 리뷰 대기) — 다음 = **M08-T01 Sedan physics & drive mode**
- Done in this session: ⓪ 소품 차도 정착·validate `props on road`(ADR-0068)·소품 `_itype` 범위 합치기·L1 랜드마크 + e2e `lod-continuity`, ① TAA(나무·간판·원경 군중)·minor 신호 계획(ADR-0069)·늦은 레이어 compileDetached,
  M07-T01 선로·rail.bin(aa9e502, ADR-0070) · T02 시간표 컴파일러(a51fc4a, ADR-0071) · T03 열차 운동·절차 전동차(01d29bc, ADR-0072) · T04 칸 물리·문·승강장·홈도어(962ed6c, ADR-0073) · T05 train 모드(e526b74, ADR-0074).
- 배포(2026-10-06 03:13): MVP 빌드 **`20261005-962ed6c-aefbe9ff`**(L0 294 + HLOD 177 + 머티리얼 32층, validate 0 — 선로·시간표 1,758 트립·승강장 11·홈도어, 선로 위 건물 충돌 제외) → dev 버킷 publish(482파일 386.8 MB, current 설정, worker 검증)
  + staging Worker 배포(efe8ea3, 버전 9d31482c — sanpo-world-dev 바인딩) + 실제 GPU staging 탑승·걸어서 승차 확인(승강장 가장자리 띠·F 재입력 수정 — efe8ea3). dev gc: 20260928 빌드 1개 삭제(7일 유지 규칙). production 배포·버킷·KV 쓰기 없음.
- 수락 요약: T01 정차 = 승강장 중심 0.01–1.15 m ✅·항공사진 1 m 초과 15 % ⚠️ / T02 스키마·간격 ≥ 90 s(최소 120–150 s) ✅ / T03 역간 소요 차 ≤ 0.05 s·점프 vs 연속 0 m ✅ /
  T04 미끄러짐 1.75 cm·관통 0·승차·닫힌 문 차단 ✅ / T05 시부야→신주쿠 전면 전망 1배속 6분 평균 59.9 fps·p99 16.91 ms·지면 공백 0 ✅(RTX 3050 Laptop 1600×900, 22.6 W).
- 실제 GPU 스크립트(scratchpad, 커밋 안 함): `ride.mjs`(탑승 측정 — `WORLD=api`면 staging), `ff.mjs`(빨리감기), `trains.mjs`·`carpos.mjs`·`trdbg.mjs`(열차 표시 진단), `pl/{railpos,runcheck,findtrain,trackbldg}.mjs`(rail.bin·시간표 점검).
  측정 주의: 15–25 s마다 스크린샷을 찍으면 그때마다 100–270 ms 끊김(인공물), 측정 중 `pnpm test`를 같이 돌리면 그 구간 30 fps — 깨끗한 회차만 기록.
- **키 대기**: ODPT_CONSUMER_KEY 없음 → 긴자선 GTFS 'waiting-key'(컴파일러는 가상 픽스처 `tests/fixtures/gtfs-mini`로 검증). 키가 생기면 `ODPT_CONSUMER_KEY=… pnpm pipeline fetch --source odpt-tokyometro --update-lock`
  → `pnpm pipeline timetables --build-id <id>`(또는 다음 build) → validate → publish(키 값은 로그·파일·커밋 금지 — fetch.ts가 URL·오류에 남기지 않음).
- Next step (정확히 한 걸음): PR #20 리뷰·병합 뒤 M08-T01 — `docs/roadmap/M08.md` `### M08-T01` 블록 → `packages/physics/src/internal/worker/vehicle-sedan.ts`(WheeledVehicleController) + `content/vehicles/sedan.json`.
- Blockers: 없음(M07-T06은 M09-T04 의존 — 보류)

## Recently Completed
- M07 Trains T01–T05(session #20, 2026-10-05~06) — 선로(OSM 이름 + N02 대조, 좌측통행, 0.5 m 표본, 곡률 제한, 승강장 정차) → 시간표(JR 합성 근사 + 긴자선 GTFS 컴파일러·키 대기) → 열차(메인 스레드 순수 함수,
  절차 가상 통근형 전동차 LOD 3 + 차내, 노선색 띠만) → 칸 물리(키네마틱 합성 바디·문·승강장·홈도어) → train 모드(서기·좌석·전면 전망·빨리감기·LCD 일영한·경계역 자동 하차). 수치는 위 수락 요약. ADR-0070–0074
- M06 MVP 재빌드·staging(2026-10-05) — `20261004-ed3d33c-8de63322`: L0 294(243.5 s, 260.4 MB — nav 18.3 MB·횡단 1,500(신호 522), 차선 4,432 + 연결로 4,227(신호 1,101), 1.32 MB) + HLOD 177 + 머티리얼 32층, validate 0(도로 간극 최대 1.9 cm).
  dev 버킷 publish(478파일 376.4 MB, current 설정) + staging Worker 배포(ed3d33c) + 스모크. 실제 GPU staging: 첫 표시 7.15–7.94 s·첫 로드 23.3–24.5 MB ✅, 스크램블 대기 무리·횡단·차량 정지 확인,
  걷기 봇 3분 319 m 낙하·끼임 0(차 접촉 3프레임 5.8 cm — 측정 시간 기준 차 수준). production 배포·버킷 쓰기 없음.
- M06-T07 Scramble showcase — 늦은 출발 금지(보행 적까지 남은 시간 `pedWalkLeftS`), 핫스팟 건너편 목적지 crossShare 0.6, 대기 깊이 4.5 m, Detour 분리 1.5, nav 횡단 끝 조각 병합(북쪽 3 → 1),
  골든뷰 12:01:36(전방향 보행) + 군중 준비 조건. **수락(체크리스트 수치 테스트)**: 대기 무리 10곳 108명·깊이 p90 2.9–4.7 m, 대각 27 %, 출발 p50 0.87·p90 1.4 s, 점멸 출발 0,
  차량 녹색 때 횡단 위 0–3명(전 14–26). 실제 GPU 주기 GIF docs/screenshots/M06/T07. ADR-0067 (2026-10-05)
- M06-T06 Traffic visuals & kinematic sync — 가상 절차 차종 7종(render `vehicles/*`, LOD 35/110/520 m, 로고·번호판 없음, 클리어코트 도장·바퀴 회전·등화), core `VEHICLE_TYPES`·`KinematicFrame`,
  physics `worker/kinematics.ts`(sim 직결 포트 → NPC_KINEMATIC 상자, 외삽 MoveKinematic). 실제 GPU에서 찾아 고침: TAA 모션 벡터(positionPrevious — 차량·군중), 횡단보도 위 정차(런타임 횡단 띠 앞 정지 —
  world-mini 35 % → 0), 차 높이(차선 점 4 m — ±0.02 m), 차선 넘김 중심 튐. **수락**: 단위(실제 Jolt 최소 간격 0.136 m) + 걷기 봇 5분 × 2 관통 0·낙하 0·끼임 0 ✅.
  물리 틱 ≤ 0.33 ms, sim p95 2.7–4.5 ms, GPU +1.3/−0.35 ms(거리)·+0.01 ms(상공). 나무·간판 TAA 모션 벡터는 별도 작업 칩. ADR-0066 (2026-10-05)
- M06-T05 Traffic — 파이프라인 `derive/lanes*`·`build/lanes-cell.ts`: OSM 간선 → 좌측통행 차선·교차로 정지선·연결로(좌 = 연석·우 = 안쪽)·신호 코드·셀 포털 → `lanes.bin` v2.
  신호 코드 배치 변경(연동 오프셋 칸 6비트·ID 14비트), 주축 A = 등급 가중(간선), 기본 계획 A 67 s·B 43 s. sim.worker `traffic/*`(그래프 병합·IDM·회전·양보·스폰) + 차량 SAB, game 448 m nav+lanes.
  **수락**: world-mini 10분(40대) 교착 0 ✅·적신호 통과 0 ✅, 메이지도리 평균 속도 비율 **0.37 ⚠️**(목표 0.4–0.8, 신호 없으면 0.82 — 120 s 주기·회전·가장자리). 브라우저 9셀 정오 90대 + 보행자 950:
  워커 p95 2.2–2.7 ms, 위반·교착 0. ADR-0065 (2026-10-04)
- M06-T04 Crowd tier B/C & LOD — 공유 정체성(`appearance.ts`), tier B 꺾은선 흐름(`flow.ts` — 경로·횡단·신호는 A와 같은 함수, 가로 오프셋 저역 통과), 80 ± 5 m 승강격(`lod-manager.ts` —
  횡단 중 승격은 횡단 필터로), 오케스트레이터(`crowd-sim.ts` — 목표 1,000 × 시간대 × 날씨(비 ×0.6), 면적 균일 스폰·평소 멀리/시야 밖), render 원경 tier C 스프라이트(`crowd/far.ts` 보도 점 235–800 m,
  밀도 = sim 수 ÷ 1,000). **수락**: 총 950–1,000 유지 ✅, 승강격 100+회 위치 튐 < 0.25 m/틱 ✅(단위), 팝핑 리뷰 GIF docs/screenshots/M06/T04(승격 150·강등 97 — 육안 팝핑 없음),
  GPU(1440p High, 22 W 소비) 군중 켬−끔 +0.44 ms(지상)·+0.56 ms(상공) ≤ 2.5 ✅. ⚠️ 소지품(가방·우산) 미구현. ADR-0064 (2026-10-04)
- M06-T03 Crowd tier A (DetourCrowd) — 파이프라인 `derive/nav/*`·`derive/navmesh.ts`·`build/nav-cell.ts`: 0.5 m 보행면 분류(보도·생활도로·횡단 띠(끝 +1.5 m)·OSM 보행로, 간선 차도·건물·소품 없음) →
  Recast 64 m 타일 16개(WF 좌표) + 횡단 기록(보행 신호 코드 = 소품 신호기 규칙) → `nav.bin` v1 bin+gzip(셀 66–161 KB). sim.worker: 타일 NavMesh·DetourCrowd tier A 상태 기계
  (걷기 → 대기점 접근 → 보행 W 대기·반응 → 횡단(좌측 보행 차로) → 재계획), 플레이어 = 조향 없는 에이전트, game `wiring/streaming-sim.ts`(256 m nav 공급), 군중 기본 켬(`?crowd=0|dummy|scramble`).
  **수락**: world-mini 실데이터 250명 적색 대기 → 녹색 동시 횡단 250, 틱 p95 1.6–1.7 ms ≤ 12 ✅, 관통 0·내비 밖 0 ✅(단위 테스트, 결정론). 실제 GPU 워커 p95 1.6–2.6 ms(22–34 W), 60 FPS,
  docs/screenshots/M06/T03. world-mini 픽스처 재빌드(nav 포함·OSM 횡단 보정, 5.7 MB). e2e `crowd.spec.ts` agents 추가, 픽셀·물리 스펙 `crowd=0`. ADR-0063 (2026-10-04)
- M06 사전 정리(9bc9241) — 원점 재설정 e2e 픽셀 차 = Node PNG 디코드(19 s). 부팅 실측(실제 GPU): 메인 long task 최대 0.44 s, 프레임 멈춤 1.4–1.9 s × 3(GPU 파이프라인 생성)·진행 표시 없음 →
  선컴파일 머티리얼 묶음마다 1프레임 양보 + 대기 LUT 비동기 컴파일 + 로딩 패널 "준비" 행: 첫 표시 7.37–7.51 → 6.41–6.73 s, 머티리얼 멈춤 ≤ 0.77 s(대기 LUT 1.3–1.55 s 남음). ADR-0060 보충
- M06-T02 Signal controllers — 신호 기둥 `props.inst` 5번째 칸 = 현시 코드(교차로 ID × 16 + 계획 × 4 + 그룹), 교차로 = 1020 묶음, 그룹 = OSM 차도 방향 봉우리 2개(셀 + 8-이웃),
  `content/sim/signal-plans.json`(standard 120 s·scramble 120 s 전방향 보행 26 + 점멸 6, 사이트 = 시부야 스크램블), sim 제어기 = 게임 시각 순수 함수(`signalStateAt`), render 렌즈 발광(`setSignalLamps`).
  **수락**: 스크램블 사이클 계획표 1 s 이내 단위 테스트 ✅. 실 GPU 북향·서향 차량 등 / 전방향 보행 녹 확인(docs/screenshots/M06/T02). 9셀 그룹 일관성 126쌍 중 6쌍 어긋남(5갈래 교차로 기둥 1개 ⚠️).
  실 GPU에서 소품 전체 사라짐(정점 버퍼 9–10 > 8) 발견·수정 + 단위 테스트. ADR-0062 (2026-10-04)
- M06-T01 Sim worker & instance outputs — sim.worker 30 Hz + SAB 이중 버퍼(stride 8: 위치·yaw·anim(클립+속력/10)·phase·variant·rate), 더미 1,000명 원형 걷기,
  군중 팩(Rocketbox 12종 LOD 4·팔레트 half·KTX2 12층, 3.9 MB), render 뼈 팔레트 스키닝 풀 48(틱 사이 외삽·LOD0 그림자), 후처리 NaN 정리(블룸 전체 검정 근본 원인).
  **수락 GPU(30 W, 1440p High)**: 군중 켬−끔 p50 0.33–2.34 ms(보이는 195–472명) ≤ 2.5 ✅, sim 틱 0.1–0.5 ms. 임포스터는 T04로(편차). e2e crowd 스모크(WebGL2) 추가. ADR-0061 (2026-10-04)
## Backlog (M05 미구현·이번 세션 발견 — 사전 5 정리)
- [signage] **창문 시트**(M05-T06 ⚠️): 상가 창 유리에 붙는 가상 광고·営業中 시트 미구현 — 파사드 1층 간판 띠와 같은 아틀라스로 창 셀 일부에 시트 텍스처(가상 브랜드, 로고 없음). 후보 시점 M09-T03(야간 점등) 전 또는 M10.
- [bridges] **PLATEAU 상판 없는 OSM 단독 육교**(M05-T08 ⚠️): `highway=footway + bridge=yes`(+ 계단 두 끝) 중 PLATEAU brid가 없는 것 — OSM 선 + 폭 태그(없으면 2.5 m)로 절차 상판·난간·계단 메시 + JCOL 램프. 공원 비탈 계단(두 끝 지형)도 같은 경로.
- [markings] PLATEAU frn 区画線·車道中央線·車線境界線·車道外側線·規制標示(1010–1040·1200, MVP 수십 개)가 있는데 미사용 — 쓰려면 같은 구간의 OSM 차선을 빼는 규칙 필요(이중선).
- [trees] **PLATEAU veg가 있다**(시부야 zip udx/veg 50·신주쿠 99 항목 — M05-T04 "원천 없음" 기록은 틀림). SolitaryVegetationObject 위치·높이로 OSM 나무 보완 검토.
- [props] PLATEAU frn의 다른 都市設備(신호·표지·전주·가로등 등, function 2000·3xxx·4xxx 수천 개)도 있음 — M05-T03 규칙 배치와 대조·교체 검토.
- [markings] 스크램블 외 OSM만 있는 횡단(≈ 950)의 ≤ 0.5 m 검증·보정(고해상도 정사영상 필요, ADR-0058).

## Known Issues
- [rail] **역 = PLATEAU 역사·선로 위 빌딩 껍질 안**(16동): 선로 표본 ≥ 6 m 덮는 건물은 충돌 제외, 431·461 ≤ 12 m 상옥만 렌더 제외 → 하라주쿠·요요기·신주쿠에서 열차·승강장·운전실 시야를 건물 면이 가린다(ADR-0073 대안: 선로 회랑에서 역사 면 잘라 내기·역 오버라이드).
- [rail] 항공사진 대조 1 m 초과 15 %(T01 ⚠️ — 0.49 m/px 한계, 시부야 데크·고층 그늘), 역간 소요 = 곡선 그대로라 실제보다 짧다(시부야→하라주쿠 91 s vs ≈ 2분, 근사 — 노선별 여유 계수 후보).
- [trains] LOD0 창 = 구멍(유리 반사 없음), 차내 벽 안쪽 = 스테인리스 색, 차내 안내 화면 면은 빈 발광(글자 = 화면 오버레이), 터널 입구에서 칸 통째 사라짐(긴자선 고가 끝), 차임·음성 없음(M09).
- [trains] 긴자선 GTFS 키 대기(ODPT) — 시부야 고가에 긴자선 열차가 아직 없다. 종착 시부야는 도착·출발 열차가 서로 다른 선로 트립이라 승강장에서 바뀐다(block_id 미사용).
- [tests] 이 PC에서 실제 GPU 측정·Docker와 동시에 `pnpm test`를 돌리면 `crowd-lod`(틱 p95 ≤ 12 ms)·`miniflare`(5 s) 가 가끔 실패 — 단독 재실행은 통과(2026-10-06 확인).
- [physics] 역 에스컬레이터 **데이터 없음**(M07). 육교·계단 = M05-T08(ADR-0056, 램프 프록시 위 수평 속력 유지). 높이장 재질 = asphalt 고정(보도 triMesh만 tile) — 높이장 삼각형별 재질은 발소리(M09) 때.
- [bridges] 교량·계단은 L0 overrides에만(HLOD 없음). OSM `footway bridge=yes` 단독 육교·공원 비탈 계단(두 끝 지형) 메시 없음. 계단 블록을 걷어낸 자리에 PLATEAU 옆벽이 일부 남을 수 있음. freecam이 상판 슬래브 안이면 검은 면(블룸 켜면 화면 전체 — NaN 의심, 별도 작업 칩).
- [trees] L1 HLOD 나무 카드·HLOD 지면 녹지 색 미구현 → L0 반경(384–768 m) 밖 공원은 회색 지면(요요기 상공 골든뷰). PLATEAU veg 원천 없음. 규칙 가로수는 PLATEAU LOD1 도로 구역(보도 분류 없음)에선 안 생김.
  빽빽한 숲 나무 GPU 3–6 ms(상세 LOD 잎·그림자) — 대안 ADR-0052. 잎은 알파 테스트 계단(TAAU 완화). `?trees=0` = 나무 끔(비용 비교·flicker e2e).
- [signals] 5갈래 이상 교차로의 세 번째 방향 신호는 가까운 그룹(2현시 모델, ADR-0062). 옛 빌드(코드 없음)는 모든 신호가 같은 박자. 같은 위치 중복 신호는 0.5 m 중복 제거로 해결(M06-T02).
- [props] 전선은 전주 사이 직선(5가닥, 110–170 m에서 사라짐), 가로등 규칙 배치 없음(OSM 희소), 차량 신호 방향당 1개, 소품 야간 발광 없음(M09-T03), PLATEAU frn·무전주화 지구 미사용(ADR-0051).
  three `stats.triangles`가 합친 풀의 퇴화 삼각형까지 센다(+0.5M). 첫 표시 12.1–12.7 s ⚠️ — 선컴파일 병렬화·소품 풀 지연 컴파일 검토(T07/T08).
- [roads] 옹벽(DEM 급락) 옆 보도는 벽 기하 없이 1.5 m 띠 뒤 급경사 흙면, 횡단보도 앞 연석 낮춤 없음, 보도 윗면 가장자리 정점 4 m 간격 → 치마 사이 ≤ 1 cm 선(ADR-0049).
- [markings] PLATEAU frn 横断歩道·停止線 우선(ADR-0058) — PLATEAU 区画線·車線·規制標示(1010–1040·1200)는 미사용(OSM 차선과 이중선 방지). OSM만 있는 횡단(≈ 950)은 규칙 폭·위치 그대로, 회전 화살표·버스 정류장·자전거 표시 없음, 차선은 OSM lanes 태그 의존(ADR-0050). ⚠ ODbL 파생 DB(osm-derived.gpkg) 공개는 M11-T05.
- [streaming] 순간이동을 이어 하면 이전 목적지 작업이 큐(동시 8·대기 16)에 남아 스로틀에서 새 발밑 L0가 늦게 온다(Fast 3G 3번째 순간이동 뒤 4분+ 공중 고정 — 낙하 없음). 발밑 L0 우선·이전 목적지 취소는 M08 transition(`whenReady`)과 함께(ADR-0046).
- [avatar] Rocketbox 리그 23뼈 — 손가락·표정 애니메이션 없음(편 손 고정), 발 IK 없음(재생 속도 [0.75, 1.6] 자르기 → sprint 6.81 m/s 클립을 5 m/s에 쓰면 약간 미끄럼). ADR-0057.
- [worker] 이 PC에서 miniflare 테스트 'GET 200 … ETag'가 5 s 시간 초과(HEAD에서도 같음 — 환경). 로컬 전체 테스트는 `SANPO_SKIP_MINIFLARE=1` 고려.
- [physics] 셀 콜라이더 = 건물(0.3 m 단순화) + 높이장 + 보도 triMesh + 소품 프리미티브(M05-T03, 64 m 블록 합성). 나무 줄기 = M05-T04. CI(SwiftShader)에선 워커가 CPU 경합으로 적재 틱이 길다(기록만).
- [render] 밤에 모든 건물 창(실내 매핑 발광)이 켜진다 — 창 점등 스케줄(용도·시각·층별 확률, `facade-params` 야간 점등 단계)은 **M09-T03**(Night lighting)에서. M03 보강 ⑤ 결정(2026-09-30).
- [render] 동적 해상도는 60 Hz 수직 동기에서 여유를 못 재 "시도-후퇴"로 0.05씩 오르내린다(15 W 1080p High: 120 s에 19회, 0.5–0.85). 정지 떨림에는 영향 없음(ADR-0038 측정) — 선명도 변화가 거슬리면 시도 간격·히스테리시스 조정.
- [perf] **이 PC GPU 전력 상한이 15 W ↔ 30 W로 바뀐다**(LG gram 17 17ZD90R, RTX 3050 4GB Laptop, 기본 30 W·최대 45 W, 전원 모드 최고 성능) — 15 W에선 2배 느림.
  측정은 행마다 `nvidia-smi enforced.power.limit` 기록. 15 W 기준 1080p Medium 회전 15.4–17.0 ms(2뷰가 16.6 ms 살짝 초과 → 동적 해상도가 흡수), 30 W 8–9 ms(ADR-0039).
- [perf] WebGPU 타임스탬프 합은 실제 프레임의 ≈ 1/4(클럭 비율) → 비중(`stats().gpu.passes`)만 신뢰, 절대값은 무제한 프레임 rAF p50. `pnpm perf`(M02-T07~)에 반영 필요.
- [render] TAAU(1080p Medium ≈ 12 %)는 three 패치 없이 경량화 불가 → 동적 해상도로 흡수(ADR-0039). L0 반경 축소(HLOD 우선)도 보류.
- [render] 정지 화면 원경 수평선 부근 서브픽셀 건물 윤곽의 TAAU 재구성 반짝임 잔존(>12 단계 0.047 % 픽셀, ADR-0038). 대안: TAAU 분산 감마 1.5 패치(−30 %, 고스팅 위험), 원경 윤곽 사전 필터링.
- [perf] 첫 표시 ≈ 11 s(12 s 목표 근접) — 선컴파일 ≈ 5 s·대기 LUT. 첫 표시 직후 HLOD 1–2 s 디졸브(ADR-0033). T07/T08에서 선컴파일 병렬화 검토.
- [render] 차도–비도로(광장·주차장) 경계 `_SURF` 1 m 계단 잔존(차도–보도 경계는 보도 메시가 덮음, M05-T01). 녹지는 M05-T04에서 잔디로.
- [pipeline] PLATEAU 동일 평면 중복 면 z-파이팅 잔존(WebGL2 원점 재설정 e2e ≈ 70 px). 벽–벽 중복 제거는 필요 시 M05-T07.
- [render] takram 패치 + three 패치(`getViewPosition` 역-Z, ADR-0040)는 three r186 전용 — three/takram 버전을 올리면 패치 재확인.
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05는 도로 메시 없음 → M03 도로 빌드 때 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → zip에서 필요한 것만 수동 해제(`data/raw/plateau-{shibuya,shinjuku,meguro}/extracted/`: MVP 24메시 udx/bldg·tran + codelists + schemas, 2026-09-29; udx/brid는 시부야·신주쿠 2026-10-02). 23구 zip은 풀지 않음(hlod-prep 스트림). 標高タイル은 hlod-prep이 받음. fetch 구현 시 lock sha256 검증.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유 → MVP 294셀은 `NODE_OPTIONS=--max-old-space-size=12288`로 통과(2026-09-29). 23구 전체 L0로 넓힐 때 셀별 스필 필요.
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함). M01-T05 실측: 셀 밖 돌출 최대 68.2 m(L0_-1_0, 허용 256 m) → 유지. 발자국 기준 전환은 294셀 빌드에서 문제가 보이면.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] e2e = 부트·렌더 스모크·디코드·정지 떨림·물리(워커·셀 콜라이더)·걷기(`walk.spec.ts`) — WebGL2/SwiftShader. WebGPU 경로·실제 성능·골목 카메라·3G 보행은 로컬 실제 GPU 스크립트(세션 scratchpad `walkbot/campen/throttle.mjs`)로 확인. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
- [e2e] 클라우드 세션 Chromium은 Playwright 번들 버전과 달라 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`로 실행. 실행 전 떠 있는 `vite preview`가 있으면 `reuseExistingServer`로 **옛 빌드**를 테스트하니 먼저 종료할 것.
- [perf] 초기 다운로드(첫 표시 시점 전송량, staging `GOLDEN_BOOT=1`) 21.3 MB(M05-T01 보도·콜라이더로 +8 MB, ADR-0033 12.7–13.4 MB) — 예산 60 MB. L0 셀이 커질수록(소품·나무·표시) 늘어난다 → 태스크마다 기록.
- [perf] `pnpm perf`(자동 비행 경로·perf-latest.md)는 아직 없음 → 이번 수치는 Playwright + 실제 Chrome 스크립트(세션 scratchpad) 측정. perf 하네스 태스크에서 재현.
- [render] 셀 추가 프레임의 GPU 업로드(다음 render에서 발생): 큰 L1 셀 1개(≈ 7 MB)가 그 프레임 render를 5–10 ms 늘린다(프레임 드롭은 없음, 18.3 ms 최대). 업로드 분할·HLOD 셀 크기는 `pnpm perf`(M02-T07~) 뒤 판단(ADR-0025). 첫 프레임 render 33–57 ms(초기 업로드) 1회.
- [render] L0 셀은 페이드 인 없이 즉시 나타나고 부모 그룹이 0.3 s 디더로 사라진다(겹침 0.3 s, 점묘). freecam 관심점엔 forward가 없어 뷰 쐐기 우선순위 미적용(traversal 개선 시).
- [game] 게임 번들(three 포함) ≈ 1.05 MB(gzip 300 KB) → Vite 500 kB 경고. 코드 분할은 M03(후처리·대기 추가 시) 재검토.
- [fixtures] world-mini·plateau-mini는 생성물 → 셀 포맷·빌드 코드 변경 시 `docker/run.sh node tools/pipeline/src/cli.ts fixture`로 재생성(`fixtures.test.ts`가 불일치를 알려 줌). plateau-mini 건물은 appearance 제거로 UV 없음, 도로는 normalize 테스트용(셀 빌드에 도로 섹션 없음).
- [game] 부트 상태 화면(src/status-view.ts)은 DOM 임시 구현 → @sanpo/ui(M08) 로딩 화면으로 대체.
- [streaming] 워커 사망 시 진행 중 작업은 `worker` 오류 → lifecycle `failed` → 60 s 뒤 재요청(더 빨리 재시도할지는 T07 실측 후). 워커가 'failed'(재시작 포기)면 풀이 다음 호출/메시지 때 sweep으로 정리.
- [streaming] Cache Storage 세션 간 LRU는 저장 순서(FIFO) 근사, 기존 항목 크기는 Content-Length(없으면 1 MiB 가정) — ADR-0023. 브라우저에서 seed 시간 미측정(M02-T05/T07).
- [streaming] 디코드 시간은 클라우드 컨테이너 headless Chromium 값(ADR-0022). 실제 데스크톱 수치는 `?world=mini&probe=decode` → 콘솔 `__SANPO_DECODE_PROBE__`로 확인. e2e는 병렬 SwiftShader 테스트와 CPU 경합 → `postMs`는 중앙값으로 판정.
- [streaming] 재계산은 Node 실측 평균 0.41 ms(ADR-0023). 첫 호출 ≈ 8 ms(JIT) → 부팅 로딩 중이라 허용, 브라우저 수치는 `pnpm perf`(M02-T07~). 고고도 L1 +16셀 메모리는 M02-T04 HLOD 크기로 확인(ADR-0021).
- [worker] miniflare 통합 테스트는 `wrangler dev`를 띄워 ≈ 15–25 s(CI 포함). 느리면 `SANPO_SKIP_MINIFLARE=1`. 이 PC에 9/26–27부터 떠 있는 workerd 8개는 이번 세션 것이 아님(건드리지 않음).
- [publish] R2 S3 키가 없어 `api` 업로더(REST) 사용 중 — HEAD 검증은 Worker 경유. S3 키를 발급하면(대시보드 R2 → API 토큰, 두 버킷 Object Read & Write) 자동으로 `s3` 업로더.
- [ci] Biome `noExcessiveLinesPerFunction`이 일부 함수(예: 객체 반환 팩토리)를 놓침 → `scripts/check-size.ts`가 정본(docs/15 §2).
- [tile-format] `trees.inst`·`lights.bin`·`audio.json` 인코더/디코더 미구현(props.inst = M05-T03)(레지스트리·모델 타입만) → 해당 태스크(M04~)에서 추가. 헤더 gzip(flags bit0)은 v1 미지원(ADR-0017).
- [pipeline] validate 미구현 항목: 랜드마크 20곳 정확도 샘플, report.html(현재 report.json·report.md), world.json·셀 간 교차 검사 일부. 증분 캐시(`data/build/.cache`)도 미구현 → 매 빌드 전체 재생성(3×3 ≈ 5 s).
- [pipeline] terrain `_SURF`는 전부 7(plaza) 임시값 → M03 도로·녹지 분류. buildings.mesh는 면별 정점(weld 없음, 정점/삼각형 ≈ 1.9) → 크기 문제 시 weld.
- [pipeline] world.json의 `files.materials/rail/map`은 아직 없는 파일을 가리킨다(스키마 필수 필드) → 각 태스크(M03/M07/M08)에서 생성.
- [pipeline] HLOD: 2020(L2/L3) vs 2025(L0/L1) 원천 차이로 원경 전환 시 일부 건물 등장·소멸 가능. 항공사진 지면색(04 §4.5 L2)·나무 임포스터는 M03/M04. 2020 원천 용도 코드가 대부분 null → 야간 점등 단계 기본 6.
- [tools] `pnpm pipeline`은 `normalize`·`build`·`validate` 구현. terrain normalize·build는 GDAL 필요 → 컨테이너 전용. 재현성(gzip=zlib 버전)은 컨테이너 기준.
- [geo] 골든 재생성 `--check`는 pyproj가 필요해 CI 미포함 → 파이프라인 CI(M01-T05 이후)에서 pyproj 설치 후 추가 검토.
- [geo] build가 world.json `crs`를 `WORLD_ORIGIN`에서 생성(validate로 확인), 게임 부트(`world-load.ts checkManifest`)도 `WORLD_ORIGIN`과 대조(M01-T07). 셀 전체 해시(hash32) 검사는 메인 스레드 예산 때문에 M02 디코드 워커로.

## Notes (M00-T03 조사 결과)
- **세션 종료 시 `pnpm codemap` 자동 실행 훅: 적용 안 함.** Claude Code `SessionEnd`는 clear/logout/입력 종료 등에서 발화하고 공유 1.5 s 예산·차단 불가. 클라우드 세션은 명시적 종료 없이 비활성 VM 회수로 끝나 발화가 보장되지 않고, 발화해도 결과가 커밋·푸시되지 않은 채 컨테이너와 함께 사라진다. 대안: `/handoff` 7단계(수동) + CI `records` 잡(커밋본 ≠ 재생성 결과면 실패)이 누락을 막는다. 필요 시 `Stop` 훅(턴마다 codemap 갱신, `stop_hook_active` 가드)을 별도 검토.
- 프리뷰 URL은 staging Worker의 버전(`pr-<N>` 별칭)이며 staging 바인딩을 공유한다.

## Decisions Pending
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)
- M06 사전 2 ⚠️: 스크램블 등 PLATEAU 밖 횡단의 ≤ 0.5 m 수치 검증 — 고해상도 정사영상(유료·별도 라이선스 가능) 도입 여부.
- M07 ⚠️: 역사 껍질 처리 — (a) 선로 회랑의 PLATEAU 역사 벽 면 잘라 내기(지붕만), (b) 4개 역 오버라이드로 다시 짓기, (c) 지금처럼 둠. 역 동선(M07-T06) 전에 결정.

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [x] GitHub Environment `production` 생성 + Required reviewers 지정
- [x] workers.dev 서브도메인 등록 — staging: https://tokyo-sanpo-staging.kolom1357.workers.dev (`/api/health` 정상)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — 컴파일러 완료(M07-T02), 키는 환경 변수 `ODPT_CONSUMER_KEY`로만(파일·로그 금지) → `pnpm pipeline fetch --source odpt-tokyometro --update-lock`
- [x] 파이프라인 빌드 머신(16 GB+ RAM, Docker) — 로컬 Windows PC + Docker Desktop(16코어, 16 GB 할당)
- [x] 국토지리원 기반지도정보 DEM 다운로드(533935·533945, DEM1A/5A 2025-08-22)
