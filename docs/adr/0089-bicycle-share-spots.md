# ADR-0089: 자전거(MotorcycleController + 저속 보조)·cycle 모드·카셰어/공유자전거 거점
- Status: Accepted (M08-T02 거점·M08-T03)
- Date: 2026-10-17

## Context
- 08 §7: 생활형 자전거, 페달 토크 모델(평지 ≈ 24 km/h), 저속 안정 보조·발 딛기, 보행자 근접 서행. 수락 = 평지 최고 22–26 km/h, 1 m/s 저속 넘어짐 0.
- M08-T02 "카셰어 스팟 배치(OSM 주차장 기반)", T03 "공유자전거 독 배치" — 브랜드는 가상(실제 운영사·로고 금지).

## Decision
1. physics `vehicle-bicycle.ts`: Jolt MotorcycleController 2륜. 페달은 단일 기어 1:1 "엔진"(평평한 토크 곡선, 최고 회전 = vmax × 1.4)의 스로틀 = 입력 × clamp(1 − v/vmax) → 뒷바퀴 ≤ 60 Nm.
   저속(< 2.2 m/s)은 Jolt 기울기 제어기를 끄고 롤 스프링(차체 위 × 세계 위의 전방 성분), 정지(< 0.4 m/s)는 발 딛기(강성 8000). 기울기 상한 35°(Jolt mMaxPitchRollAngle). 공용 부분은 `vehicle-common.ts`.
   스냅샷 차량 칸 4 → 8(세워 둔 카셰어·자전거 몫).
2. traversal: cycle = drive와 같은 모드 구현에 사양(`RIDE_SPECS`)만 다르게 — 자전거는 S = 브레이크(후진 없음), 방향지시등 없음, 벨, 보도 = 보행자 6 m 안일 때만 6 km/h(08 §7), AEB 같은 규칙.
   정지 중 출발 막기는 보행자(`HazardCircle.kind 'ped'`)만 — 세워 둔 차 바로 뒤에서 탄 자전거가 영영 못 움직이던 문제.
3. render: core `VEHICLE_TYPES` 8번째 `bicycle`(share 0 — 교통 스폰 없음), `bicycle-model.ts` = 스텝 스루 프레임·바구니·흙받이·등화 + 앉은 절차 사람(몸통·머리·팔·다리 막대).
4. 파이프라인 `derive/share-spots.ts` → cell meta `interactables`: carShare = OSM amenity=car_sharing(점·면 중심, 건물 안이면 25 m 안 열린 땅), 없는 셀은 공용 노면 주차장(150–20,000 m²) 1곳 중심;
   bikeDock = amenity=bicycle_rental(차도면 비차도로). yaw = 가장 가까운 차도 쪽, 셀당 카셰어 ≤ 2·자전거 ≤ 3, 같은 종류 60 m 띄움. OSM 추출에 amenity=car_sharing,parking,bicycle_rental(+ parking·access 태그).
   MVP: car_sharing 8 특징·공용 노면 주차장 587·bicycle_rental 141.
5. 게임 `vehicles/share-spots.ts`: live L0 셀 meta.json → 가장 가까운 거점 2곳씩(130 m 안)에 카셰어 1대·자전거 2대를 세워 두고 220 m 밖이면 치운다. 타고 10 m 넘게 옮긴 것은 거점에서 떼어 "부른 것"처럼(걷는 플레이어 200 m 밖이면 치움).
   가상 브랜드 = 카셰어 SANPO Car(흰 차체 + 청록 띠), 공유자전거 SANPO Cycle(청록 프레임). 편의 소환 walk R(차 — 연석)·B(자전거 — 1.6 m 앞).

## Consequences
- Node: 평지 23.5 km/h·1 m/s 롤 ≤ 0.2°. 실제 GPU(로컬 dev, `bike-course`): 최고 23.4 km/h, 약 0.94 m/s 20 s 롤 ≤ 2.5°·넘어짐 0, 60 fps·23 W.
- ⚠️ 탄 사람은 상자 마네킹(페달 따라 다리 움직임 없음), 정지 발 딛기는 롤 고정만(발 내림 자세 없음). 자전거 거점 = 위치만(독 설비 모델 없음 — 세워 둔 자전거가 표지).
- 거점 데이터는 MVP 재빌드(파이프라인) 뒤부터 — 옛 빌드에는 interactables가 비어 있다(소환·프리셋으로 탈 수 있음).
