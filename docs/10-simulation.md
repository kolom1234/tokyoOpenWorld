# 10 — Simulation (`@sanpo/sim`): 시계·날씨·군중·교통·열차·발견

## 1. 구조
- 메인: `SimHost`(시계, 날씨, 계절, POI 발견 — 가벼운 로직) + sim.worker 프록시.
- `sim.worker` (30 Hz 고정): 군중, 교통, 신호, 열차. 출력은 `SharedInstanceBuffer`(core 타입, SAB) 3개(보행자/차량/열차 칸) → wiring이 `render.layers.*.bindShared()`로 연결.
  구현(M06-T01, ADR-0061): `worker/{sim.worker,instance-buffer,host}.ts` — SAB 이중 영역(front 뒤집기), 필드 = x,y,z(WF − anchor)·yaw·anim(클립 + 속력/10)·phase·variant(u16)·rate(주기/s, 외삽용), render가 틱 사이 외삽. 조정값 = `content/sim/*.json`(YAML 대신).
- 태양·달 방향/조도, 계절은 SimHost가 계산해 `environment(): EnvironmentState`로 제공(suncalc 2.x: 도 단위·북 기준 방위).
- 결정론: 모든 난수는 `createRng(hash32(WORLD_SEED, cellId, entityKind, spawnIndex))`(`WORLD_SEED`는 core 상수). 같은 시각·위치면 같은 풍경.

## 2. 월드 시계
- 내부 시각 `gameTimeMs`(Unix ms). 표시 시간대 Asia/Tokyo(UTC+9, 서머타임 없음).
- 모드: `realtime`(현실 JST 동기) / `custom`(시작 시각 + 배속 1·2·10·60) / `frozen`(포토모드·골든뷰·`?time=`). 부팅 기본 = 오늘 12:00 JST부터 custom 1배속(설정 UI M08 전, ADR-0029).
- 요일 유형: 평일 / 토요일 / 휴일(일요일 + 일본 공휴일 내장 테이블 `content/sim/holidays-jp.json`, 내각부 공개 CSV 기반 2026–2035).
- 운행일 경계: 04:00 JST (열차·교통 시간표 기준).

## 3. 날씨·계절
- 상태 파라미터(`WeatherParams`, core): `cloudCover 0–1, rainMmH, fog 0–1, windMs, windDirDeg, snow 0–1, temperatureC?`(실시간 모드 = API 값, 자체 모드 = 월·시각별 기후 평년값 테이블).
- 자체 모드: 30분(게임시간) 단위 마르코프 전이, 월별 확률표 `content/sim/weather-climate.yaml`(도쿄 기후 경향: 6–7월 장마 강수↑, 겨울 맑음↑). 전이 보간 10분.
- 실시간 모드(`liveWeather` 플래그): Worker `/api/weather`(Open-Meteo 프록시, 10분 캐시) → WMO 코드 매핑표로 상태 변환.
- 계절: 날짜 → `SeasonParams { foliageTint, bloom, leafDensity, outfitPalette }` (테이블 `content/sim/season.yaml`).

## 4. 군중 (보행자)
### 4.1 밀도 모델
`density(area, t) = base[areaKind] × diurnal[dayType][hour] × weatherFactor × hotspot`
- areaKind: 간선 보도 / 상점가 / 교차로 대기공간 / 역 콘코스·출입구 / 공원 / 골목.
- 핫스팟 배율: `content/sim/hotspots.yaml` (스크램블 교차로, 다케시타도리, 오모테산도, 신주쿠역 동·서·남구 등).
- 비: ×0.6, 우산 착용 확률 = clamp(rainMmH/2, 0, 0.95).
### 4.2 3단 LOD
| 단계 | 범위 | 최대 수(High) | 방식 |
|---|---|---|---|
| A: 에이전트 | 0–80 m | 250 | Recast `DetourCrowd` (회피·분리), 목적지 = 보행 그래프 위 목적(역, 상점 입구, 교차로 건너편) |
| B: 흐름 | 80–250 m | 750 | 보행 그래프 폴리라인 추종 + 횡방향 오프셋, 회피 없음, 4프레임 분할 갱신 |
| C: 원경 | 250 m+ | (렌더 전용 임포스터 밀도 텍스처) | 셀 meta 밀도 기반 스프라이트 군집 |
- 구현(M06-T03, ADR-0063): tier A = `crowd/agents-detour.ts`(DetourCrowd 반경 0.3, 플레이어 80 m 안 목표 수 = 250 × 시간대 곡선, 핫스팟 가중 스폰) + `agent-fsm.ts`(걷기 → 횡단 대기점 접근 → 보행 W 대기·반응 0.2–1.6 s → 횡단(좌측 보행 차로) → 재계획). 내비 = 셀 `nav.bin`(보도·생활도로·횡단 띠·보행로만, 간선 차도 없음).
- 구현(M06-T04, ADR-0064): tier B = `crowd/flow.ts`(경로 꺾은선 등속, 횡단·신호는 A와 같은 함수, 가로 오프셋 저역 통과 — 전원 매 틱 이동, 4프레임 분할 안 함), `lod-manager.ts`(80 ± 5 m 승강격),
  `crowd-sim.ts`(목표 = 1,000 × 시간대 × 날씨(비 ×0.6), 면적 균일 스폰 — 평소엔 200 m 밖·시야 밖만), tier C = render `crowd/far.ts`(보도 삼각형 점 235–800 m 스프라이트, 밀도 = sim 수 ÷ 목표).
- 승격/강등 시 ID·외형·목적지 유지(연속성).
- 신호 준수: 적신호면 연석 대기선에 정렬 대기. **스크램블 교차로(보차분리 전방향 보행 현시)** 재현. 녹색 점멸 시 새 진입 중단.
- 차량 회피: 차선 가로지르지 않음(횡단보도만), 플레이어 차량 근접 시 정지·회피.
### 4.3 외형
- 베이스 바디 12종(Microsoft Rocketbox, 성인 남녀 6·6 — ADR-0057) × 밝기·키 변형(variant) × 소지품(가방, 우산 — T04) × 계절 의상(M09).
- 애니메이션(뼈 팔레트, ADR-0057): 걷기(보통·느림·빠름), 대기, 휴대폰. 우산 걷기·계단 오르기는 Rocketbox에 없음(우산 = idle만).

## 5. 교통
### 5.1 차량 모델
- IDM(Intelligent Driver Model): `v0 = 제한속도`(OSM maxspeed, 없으면 도로 등급별 30/40/50 km/h), `T = 1.5 s, a = 1.2 m/s², b = 2.0 m/s², s0 = 2.0 m, δ = 4`.
- 경로: 교차로마다 회전 가중치(직진 0.6, 좌회전 0.25, 우회전 0.15)로 선택. 차선 변경은 다음 회전에 필요할 때만(단순 MOBIL 조건).
- **좌측통행**: 좌회전은 보행자 양보, 우회전은 대향 직진 양보(우회전 화살표 현시가 있는 곳은 예외).
- 스폰: 플레이어 400 m 내 시야 밖 차선, 500 m 밖 디스폰. 최대 150대(High). 밀도 = 도로 등급 × 시간대 곡선.
- 차종(가상 디자인): 소형 세단, 택시(일반형 + 지붕 표시등 "TAXI"), 경차, 경트럭, 미니밴, 택배 트럭, 노선버스(가상 도색). 실제 로고 없음.
- 플레이어 60 m 내 차량은 물리 키네마틱 바디 동기화(08-physics §3).
### 5.2 신호
- 교차로별 `SignalController`: 현시 계획(기본 2현시 사이클 120 s, 황색 3 s, 전적 2 s, 보행 녹색 점멸 5 s). 특정 교차로 계획은 `content/sim/signal-plans.json`(ADR-0061 §4 — JSON)의 sites로 덮어씀(스크램블: 차량 현시 2개 + 전방향 보행 현시).
- 구현(M06-T02, ADR-0062): 신호 기둥 = `props.inst` 현시 코드(교차로 ID × 16 + 계획 × 4 + 그룹 0 차량 A·1 차량 B·2 보행 A·3 보행 B — 파이프라인이 OSM 차도 방향 두 봉우리로 그룹을 정함).
  상태 = 게임 시각의 순수 함수 `sim.signalStateAt(code)`(메인 — 빨리감기·점프 일관), 기본 계획 주기 오프셋 = `hash32(WORLD_SEED, 'signal', ID)`, 사이트 계획 = 0. T05 차선 그룹도 같은 방향 규칙.
- 신호 상태는 render(신호등 발광), 군중, 교통, 오디오(보행자 신호 유도음: **자체 합성 "뻐꾹/삐요" 계열 톤**)가 공유.

## 6. 열차
### 6.1 데이터
- `global/rail.bin`: 노선 → 방향별 트랙 스플라인(0.5 m 샘플), 역·플랫폼 정차 위치, 구간 제한속도(곡률 기반: `v = min(lineMax, sqrt(0.8 m/s² × R))`), 터널 구간 플래그.
- `global/timetables/<lineId>.json`: `trips[{id, dir, formation, stops[{stationId, arrS, depS}]}]` (운행일 04:00 기준 초).
- 출처: 도쿄메트로 = ODPT GTFS 컴파일. JR 야마노테·사이쿄/쇼난신주쿠 = **합성 시간표** (`content/sim/synthetic-lines.yaml`: 시간대별 운행 간격, 역별 정차 시간). 실측이 아닌 근사임을 크레딧에 명시.
### 6.2 운동
- 위치는 **시간의 순수 함수** `s(trip, t)`: 역간 가속 0.83 m/s², 감속 0.97 m/s², 구간 제한속도 준수 프로파일을 사전 계산(트립별 캐시). → 빨리감기·시각 점프 즉시 대응, 네트워크 전체를 싸게 계산.
- 편성: 야마노테 11량×20 m, 사이쿄 10량×20 m, 긴자선 6량×16 m. 차량 간 연결은 스플라인 위 s 오프셋.
- 문: 정차 시 개방(도착 +3 s ~ 출발 −5 s), 홈도어 연동. 문 차임은 자체 제작음.
### 6.3 MVP 운행 범위
| 노선 | 탑승 | 비고 |
|---|---|---|
| JR 야마노테선 | ✅ 시부야·하라주쿠·요요기·신주쿠 | MVP 영역 밖 구간은 비가시. 영역 끝 역에서 "미개방 구역" 안내 후 자동 하차 |
| JR 사이쿄·쇼난신주쿠 | 시각만 | 병행 선로 통과 열차 |
| 도쿄메트로 긴자선 | 시각만 | 시부야역 고가 구간만 보임, 터널 입구에서 디스폰 |
| 지하 노선(후쿠토신·한조몬 등) | ❌ | 지하 역 내부는 M12+ |

## 7. POI 발견
- POI: `{id, nameI18n, kind, pos, radius, descriptionKey, wikidataId?}` — 셀 meta는 `posLocal`(셀 로컬), `global/poi-index.json`은 `posWF`.
- 발견 조건: 반경 내 2 s 체류(자유비행 모드 제외). → `poi/discovered`, 세이브에 기록, 도감/지도 갱신.

## 8. 공개 API (`packages/sim/src/api.ts`)
```ts
export interface WorldClock { readonly gameTimeMs: number; readonly timeScale: number; readonly dayType: 'weekday'|'saturday'|'holiday';
  setMode(m: ClockMode): void; setTimeScale(s: 1|2|10|60): void; jumpTo(ms: number): void; }
export interface WeatherService { readonly params: Readonly<WeatherParams>; setMode(m: 'auto'|'live'|'fixed', fixed?: WeatherParams): void; }
export interface SimService extends SystemProvider {
  readonly clock: WorldClock; readonly weather: WeatherService; readonly season: Readonly<SeasonParams>;
  addCell(key: CellKey, nav?: ArrayBuffer, lanes?: ArrayBuffer, meta?: CellMeta): void;
  removeCell(key: CellKey): void;
  setPlayer(p: PlayerState): void;
  connectPhysics(port: MessagePort): void;                 // 키네마틱 목표 직송
  outputs(): { pedestrians: SharedInstanceBuffer; traffic: SharedInstanceBuffer; trains: SharedInstanceBuffer };
  environment(): EnvironmentState;
  signalStateAt(intersectionId: number): SignalState;
  trainsNear(posWF: Vec3d, r: number): ReadonlyArray<TrainInfo>;   // TrainInfo는 @sanpo/core
  pois: PoiService;
}
```

## 9. 내부 파일 구성 (권장)
```
src/internal/clock/        world-clock.ts, holidays.ts, day-type.ts
src/internal/weather/      markov.ts, live-mapper.ts, season.ts
src/internal/worker/       sim.worker.ts, spatial-hash.ts
src/internal/crowd/        density.ts, agents-detour.ts, flow.ts, lod-manager.ts, appearance.ts
src/internal/traffic/      lane-graph.ts, idm.ts, routing.ts, spawner.ts, yielding.ts
src/internal/signals/      controller.ts, plans.ts
src/internal/rail/         network.ts, timetable.ts, motion-profile.ts, trains.ts, doors.ts
src/internal/poi/          poi-service.ts
```
