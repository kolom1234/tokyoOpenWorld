# ADR-0076: 날씨 = 시각 순수 함수 마르코프(다시 뽑기 합류) + 적분 젖음, 빗줄기 = 깊이 인지 화면 공간 원통 층(TAAU 뒤), 우산 = 근거리 InstancedMesh
- Status: Accepted (M09-T01)
- Date: 2026-10-11

## Context
M09-T01 Do: 마르코프 날씨, 실시간 모드(플래그), 젖음 램프, 물웅덩이·파문, compute 빗줄기(폴백 CPU), 우산 확률 연동. Accept: 골든뷰 night-rain, 비 입자 GPU ≤ 0.8 ms.
10 §3: 30분 칸 전이·월별 확률표 `weather-climate.yaml`·보간 10분, 실시간 = Worker `/api/weather`(Open-Meteo, M02-T06에 이미 구현 — LIVE_WEATHER 플래그). 결정론 규칙: 같은 시각 = 같은 풍경(시각 점프·빨리감기 포함).

## Decision
1. **마르코프 = 시각 순수 함수**(`sim/internal/weather/markov.ts`): JST 30분 칸 k마다 시드 난수 u1(k) ≥ stay(달)이면 그 달 분포 p에서 u2(k)로 **다시 뽑고**, 아니면 유지.
   다시 뽑기는 앞 상태와 무관 → 모든 사슬이 첫 다시 뽑기에서 합류 = 지금 상태 = 뒤로 찾은 마지막 다시 뽑기 칸의 결과(평균 1/(1 − stay) ≈ 8–10칸, 캐시). 정상 분포 = p(T = stay·I + (1 − stay)·p).
   인접 상태 선호(맑음→흐림→비)는 없다 — 10분 선형 보간이 대신 이어 준다. 기후표 = `content/sim/weather-climate.json`(YAML 대신 — ADR-0061 규칙), 상태 9종(clear…heavy·fog·snow), 기상청 평년값 근사.
2. **젖음**(`wetness.ts`): 과거 6시간을 절대 시각 격자 5분으로 적분(비 ≥ 1 mm/h면 5분에 흠뻑, 마름 75 분 × (1 + 2 × 구름) × 밤 2) → 시각 순수 함수, 게임 1분 해상도 캐시 + 보간.
   live는 실시간 상태(램프), fixed는 비·눈 > 0이면 1.
3. **모드 우선순위**(game `weather-mode.ts`): `?weather=auto|live|<상태 id>` > 골든뷰 weather(clear·cloudy→overcast·rain·fog·snow) > `?time=`(고정 시각 = **맑음 고정** — e2e·비교 화면 결정론) > auto.
   live = `/api/weather` 10분 폴링, 404(LIVE_WEATHER=false)면 auto 유지. staging·local은 LIVE_WEATHER=true, production은 false 유지(사용자 결정 전). 출처 Open-Meteo(CC BY 4.0)를 크레딧 줄에.
4. **빗줄기 = 화면 공간 원통 층**(`render/weather/rain.ts`, 07 §8 "compute 빗줄기"·§9 "CPU 입자" 대신): 카메라 둘레 원통 4겹(반경 2.2·4.5·9·18 m, 칸 폭 0.17–0.42 m)에
   칸마다 무작위 빗줄기(길이 0.5 m, 화소 폭 ≥ 1 px), 무늬 = (원통 각도, 높이 + 낙하 8 m/s × 시각), 접선 바람으로 기울임, **씬 깊이 < 원통 거리면 가림**. 눈 = 같은 층에 둥근 송이·1 m/s·흔들림.
   후처리 TAAU **뒤**에 더한다(얇고 빠른 줄기를 TAA 이력이 지우지 않게). 상태·정점 없음 → WebGPU·하드웨어 WebGL2 공용, 소프트웨어 WebGL2(직접 렌더 — CI)는 없음.
   처음 시도한 별도 장면 패스 입자(무상태 정점 셰이더)는 r186에서 아무것도 그리지 않았다(렌더 타깃 되읽기 전부 0 — 원인 미확정) → 폐기.
5. **파문**(`wetness.ts rainRipples`): 0.42 m 칸마다 무작위 위치·위상의 퍼지는 고리 2겹 → 웅덩이 수면 법선(강), 젖은 평면 수막(약). 비 세기 = rainMmH / 8.
6. **구름 → 직사광**: AtmosphereLight 색(직사만 곱해진다) = 1 − 0.9 × 구름^1.5 — 흐린 날 그림자 대비↓, 하늘 간접광 유지(구름층·하늘색은 T02).
7. **우산**(`render/crowd/umbrella.ts`): 비 ≥ 0.3 mm/h면 비율 0.4 + 0.1 × mm/h(≤ 0.88), variant 해시(fmix32) < 비율인 사람, 70 m 안, InstancedMesh 1개(≤ 320, 색 = 비닐 흰색 위주 무지 팔레트).
   손 IK 없음(우산대가 몸 앞으로 내려옴). 군중 밀도 비 ×0.6(M06-T04)은 그대로.

## Consequences
- 수락: 단위 — 달별 확률 합 1, 10년 표본 비 비율 오차 < 0.035·평균 지속 ≈ 1/(1 − stay), 시각 역순 질의 = 순방향(순수 함수), 전이 보간, 젖음 5분·마름, WMO 매핑, 서비스 모드, 빗줄기 밀도·우산 비율.
  실제 GPU 화면·GPU 비용·골든뷰는 PR 본문(T03 야간 조명 뒤 night-rain 골든).
- 한계: 빗줄기는 지붕·처마 아래에서도 내린다(가림은 시선 앞 깊이뿐 — 위쪽 차폐 없음), 근거리 튀김(splash) 없음, 우산 손 자세 없음, 실시간 모드의 젖음은 과거 강수 이력 없이 램프.
