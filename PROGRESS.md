# PROGRESS
Updated: 2026-10-31 (session #27 — production 보안 후속, 브랜치 `claude/prod-security-followup`)

## Current Milestone: M11 Hardening & Beta ✅ — **공개 https://earthaimap.com** (2026-10-19)
## Current Task: 없음 — 공개 직후 사람 확인(docs/13 §9 체크리스트)·측량법 승인 대기
- Done in this session (#27): production 보안 후속(ADR-0102) — `/api/health` = `{"ok":true}`만, `_headers` Referrer-Policy·Permissions-Policy, HSTS·www 리다이렉트는 Cloudflare 존 설정(docs/13 §9 4b), 스모크가 본문·정책 헤더 확인. staging 검증, production 쓰기 없음.
- In progress: 없음.
- Next step (정확히 한 걸음): PR 병합·Deploy 승인 → 공개 URL `/api/health` 본문·정책 헤더 확인(www → apex 301은 2026-10-31 사용자 설정·확인 완료). 국토지리원 승인번호가 오면 ATTRIBUTION `gsi-dem`·`apps/game/src/credits.ts` 표기 후 재배포.
- Blockers: 🔶 국토지리원 측량법 제30조 사용 승인(사용자 신청 중 — 03 §6.1). ODPT 키 없음(긴자선 — 공개 후 업데이트, 크레딧 명시).

## Recently Completed
- Production 보안 후속(2026-10-31, 사용자 요청) — `/api/health` 바인딩 상세 제거(`{"ok":true}`), `_headers` `/*`에 `Referrer-Policy: strict-origin-when-cross-origin`·`Permissions-Policy`(쓰지 않는 센서·카메라·마이크·위치·결제·USB 등만 끔). HSTS는 이미 존 설정(`max-age=2592000`)이라 코드에 넣지 않음(테스트로 중복 차단). www는 DNS 레코드 없음(NXDOMAIN) → 사용자가 대시보드에서 `AAAA www 100::`(Proxied) + Redirect Rule 설정(docs/13 §9 4b) → https·http www 경로·쿼리 유지 301 한 번에 apex 200 ✅. ADR-0102
- M11-T06 Production launch(2026-10-19) — 사용자 승인: prod 버킷 publish(롤백용 + 새 빌드)·KV 포인터 → PR #25 병합·Deploy 승인 → earthaimap.com 커스텀 도메인(API) → 공개 도메인 경유 파일 검증 불일치 0 → 롤백 리허설 4 s/원복 5 s → 공개 URL 스모크(첫 로드 25.6–26.0 MB, 첫 표시 HIT 8.5–12.1 s, 콘솔 오류 0). ⚠️ 배포 직후 첫 방문(엣지 MISS) 14.9–33 s.
- M11-T02 Soak(2026-10-19) — `pnpm soak`(도보 → 열차 → 주행 → 비행 반복). 1차: 힙 누수 +92 MB/분 → 원인 three r186 RenderObject(메시 'dispose' 이벤트 필요) → `scene/release.ts`. 2차 1시간: 힙 기울기 0.38 MB/분·재시작 0·오류 0 ✅, GPU 메모리 30분 이후 0.85 MiB/분(⚠️ 관찰). ADR-0101
- M11-T01 Performance(2026-10-19) — `pnpm perf`(실제 GPU 1440p High, vsync 해제: 도보·자동 주행·신주쿠 비행 + DOF + 부팅 → docs/generated/perf-latest.md), core `Scheduler.timings`, `?perf=1`. 수정: 야간 광원 풀 1024개 매 프레임 행렬 갱신 제외(셀 그룹은 로컬 행렬만 — 월드 순회까지 끄면 셀이 덜 그려지는 착시·떨림 e2e 실패). 첫 표시 = 셰이더 컴파일(LUT 65–420 ms → LUT 굽기 기각, 재방문 3.2–4.0 s). DOF 첫 켜기만 2.0–4.6 s·이후 0.3–0.6 s(전: 켤 때마다 4.8 s). ⚠️ 프레임 p50 도보 19–24·주행 25·비행 15–16·p95 30–46 ms(전력 상태 ±25 %)(GPU 한계 ≈ 34 W), 메인 p95 17–39 ms(render CPU — three WebGPU 드로우콜 비용 + GPU 대기), sim p95 12.8 ms, 기준 GPU 2종 미측정. ADR-0100
- M11-T04 Accessibility(2026-10-19) — e2e `ui-scale.spec.ts`(배율 150 %: 메뉴 7 × 3개 언어 × 1024×768·1280×720 + HUD 운전·알림·열차·자막 — 문제 0, 지원 밖 800×500 대조 37건), HUD·지도 배치 em화(겹침 수정), 모션 민감 = OS 기본값 + UI 애니메이션 끔, 효과음 자막(`captions.ts`), render `setColorVision`(Machado + daltonize). ADR-0099
- M11-T03 Error reporting(2026-10-19) — Worker `POST /api/log`(허용 필드·이메일/URL/긴 숫자 지움·IP/UA/위치 미사용) → Workers Analytics Engine(prod `sanpo_errors`·staging `sanpo_errors_staging`), 게임 `error-report.ts`(세션 1 %·3건·`?report=force`), `pnpm errors`(SQL API). 수락: staging 666dc839에 인위적 오류 2건 → 쿼리 2그룹 ✅. + `usage.yml`/`scripts/cf-usage.ts`(무료 한도 70 % 이슈 — 첫 측정 ours 최대 R2 18.3 %, account KV 쓰기 925 %는 다른 프로젝트). ADR-0098
- M11-T05 License audit(2026-10-19) — 원문 재확인 표 03 §6.1(PLATEAU FAQ 手続き不要·상업 가능 ✅, KSJ N02 CC BY 4.0 ✅, Open-Meteo 비상업·production 호출 0 ✅, Freesound 22개 CC0 ✅, Rocketbox MIT ✅, 폰트 OFL ✅, npm 26개 GPL·NC 0 ✅, GSI DEM 🔶 측량법 제30조 사용 승인 신청 필요), ODbL 파생 DB `global/odbl/`(map 단계)·크레딧 링크, `/oss-licenses.txt` LICENSE 원문, 상표 스캔 CI 테스트(0건), 긴자선 미수록 크레딧 명시. ADR-0097
- M10 잔여(2026-10-19) — physics `setPaused`(일시정지 = 물리 시각 정지), 포토 DOF = 출력 노드 교체(`post/output.ts`, 전체 재구성 없음), 사진 상한 200(오래된 것부터 — 도감 연결·IndexedDB 썸네일 정리), 로마자 방위 접두 하이픈(Nishi-Shinjuku), 한국어 파생 POI 이름 9곳 표기법 점검(수정 0), UI 글꼴 Noto Sans JP/KR Variable(fontsource 5.3.0 조각 woff2 — 타이틀 ja 278 KB·ko 178 KB·en 58 KB).
- M10 마무리(2026-10-18) — MVP 재빌드(L0 294 + HLOD 177 + 머티리얼 32층 + 오디오 22 + map.pmtiles 1.45 MB, validate 0) → dev publish → staging. 실제 GPU staging(1600×900): HUD 시그널 8.1 Hz ≤ 10 ✅, 미니맵 0.018 ms/프레임(0.13 ms/회) ≤ 1 ✅, rAF p50 16.67·p95 16.84 ms, GPU 23.6 W(상한 33.9 W). 명소 봇 20/20(로컬 재빌드). 따라 해 보기 봇 전 단계 ✅. dev gc 대상 0.
- M10-T06 Save/load & credits(2026-10-18) — 세이브 v2(IndexedDB, v1 마이그레이션·내보내기/가져오기·자동 저장 60 s·모음 복원·이어하기), 크레딧 자동 생성(/credits.json = lock 전 원천 + ATTRIBUTION, /oss-licenses.json = 런타임 의존 24개). 수락: 구 스키마 마이그레이션 테스트 ✅, 크레딧 lock 전 소스 ✅(테스트). ADR-0096

## Backlog (M05 미구현·이번 세션 발견 — 사전 5 정리)
- [signage] **창문 시트**(M05-T06 ⚠️): 상가 창 유리에 붙는 가상 광고·営業中 시트 미구현 — 파사드 1층 간판 띠와 같은 아틀라스로 창 셀 일부에 시트 텍스처(가상 브랜드, 로고 없음). 후보 시점 M09-T03(야간 점등) 전 또는 M10.
- [bridges] **PLATEAU 상판 없는 OSM 단독 육교**(M05-T08 ⚠️): `highway=footway + bridge=yes`(+ 계단 두 끝) 중 PLATEAU brid가 없는 것 — OSM 선 + 폭 태그(없으면 2.5 m)로 절차 상판·난간·계단 메시 + JCOL 램프. 공원 비탈 계단(두 끝 지형)도 같은 경로.
- [markings] PLATEAU frn 区画線·車道中央線·車線境界線·車道外側線·規制標示(1010–1040·1200, MVP 수십 개)가 있는데 미사용 — 쓰려면 같은 구간의 OSM 차선을 빼는 규칙 필요(이중선).
- [trees] **PLATEAU veg가 있다**(시부야 zip udx/veg 50·신주쿠 99 항목 — M05-T04 "원천 없음" 기록은 틀림). SolitaryVegetationObject 위치·높이로 OSM 나무 보완 검토.
- [props] PLATEAU frn의 다른 都市設備(신호·표지·전주·가로등 등, function 2000·3xxx·4xxx 수천 개)도 있음 — M05-T03 규칙 배치와 대조·교체 검토.
- [markings] 스크램블 외 OSM만 있는 횡단(≈ 950)의 ≤ 0.5 m 검증·보정(고해상도 정사영상 필요, ADR-0058).

## Known Issues
- [launch] 배포·새 빌드 직후 엣지 캐시가 비어 첫 방문이 느리다(공개 URL 14.9–33 s, HIT 뒤 8.5–12.1 s). 대안: publish 뒤 공개 URL로 셀·공유 에셋을 한 번 GET(가까운 PoP만 데워짐)·R2 커스텀 도메인 CDN(§5). 첫 표시는 셰이더 컴파일(노트북 발열 시 7.7–8.9 s)이 대부분.
- [render] 숨겨진 탭·크기 0 캔버스에서 선컴파일하면 SSR 블러 텍스처(1×1, mip 5)로 비동기 파이프라인 생성 오류 1건(실제 창에서는 없음) — 캔버스 크기 0이면 선컴파일을 늦추거나 SSR 최소 크기 검토.
- [perf] (M11-T01 ⚠️) 1440p High 프레임 p50 15–25 ms·메인 p95 17–39 ms(render CPU = three WebGPU 드로우콜 비용 + GPU 대기), sim p95 ≈ 12–13 ms, 기준 GPU 2종 미측정 — ADR-0100 대안(셀 슬롯 병합·그림자 캐스터 축소·Medium 기본).
- [ui] (M10 ⚠️ 남은 것) 포토 모드에 LUT·모션 블러 없음, 번역끼리 베끼기는 검사로 못 잡음. (글꼴·일시정지 물리·DOF·로마자·POI ko·사진 상한은 2026-10-19 해결)
- [stations] 하라주쿠 다케시타 출구 개찰구 앞 동쪽이 PLATEAU 건물 — 다케시타 거리는 광장 북쪽 끝(≈ 40 m)에서 동쪽으로 들어간다(실제와 비슷). 걷기 봇은 모서리·군중에 가끔 걸린다(옆걸음으로 해결).
- [vehicles] (M08 ⚠️) 운전석 실내·계기판 모델 없음(HUD), 앞바퀴 조향·서스펜션 렌더 없음, 전조등 노면 조명 없음, 탄 사람 = 상자 마네킹(페달 다리·발 딛기 자세 없음), 자전거 독 설비 모델 없음. 붐비는 광장(하라주쿠 거점)에선 AEB가 자주 세운다(의도 — 보행자 우선). 교통 NPC 엔진음 없음.
- [perf] staging 첫 표시(골든 부트) 6.75–7.64 s(ADR-0086 — 전 8.7–9.1 s) → M08 뒤 6.64–9.20 s(10회, 2026-10-18): 탈것 작업은 첫 표시 두 프레임 뒤로 뺐고(선컴파일 끝 → 첫 표시 1.2–1.3 s 그대로), 변동은 대기 선컴파일 4.9–6.4 s(전력 상태). 남은 임계 경로 = 선컴파일 체인(첫 조명 셰이더 ≈ 2.3 s + 대기 LUT, 끝 ≈ 5.7–6.5 s) → 첫 프레임 동기 생성(그림자 패스 변형·HLOD/원경 지형 ≈ 0.3–0.6 s). 대기 LUT는 첫 프레임 updateBefore와 prepare에서 두 번 계산(임계 경로 밖).
- [audio] 녹음 베드는 자동 음조 검사만 거침 — 사람 귀 검수 필요(안내방송·음악 섞임 시 library.json 원천·구간 교체 후 `pnpm pipeline audio --update-lock`). 탈것 소리(ADR-0090)는 전부 합성 — 변속 음 자연스러움은 사람 귀 리뷰 대기.
- [stations] 역 계단·콘코스 기하 없음 — 개찰구 안 계단 입구 ↔ 승강장은 F 페이드 이동(ADR-0081), 출구는 역마다 1곳(하라주쿠 다케시타·요요기 서·신주쿠 서·시부야 하치코 — 가상 배치, ADR-0082), HUD 안내·도움말은 임시 DOM(M08 대체). 승강장 끝(홈도어 밖)·주오선 쪽 가장자리는 열려 있고 구덩이 구조가 받는다. 차선 데이터 없는 골목 차도는 G 차도 판정 밖.
- [rail] 역 건물 = 선로·승강장 구간 벽만 레일 띠에서 잘림(ADR-0075) — 잘린 가장자리 두께 없음, 회랑 밖 벽 유지(승강장 바깥쪽 시야 일부), 선로 위 건물 충돌 제외 유지(역 동선은 M07-T06).
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
- [night] 광원 = 규칙 배치(가상)·그림자 없음, HLOD 창 = 3.4 m 고정 층 격자, 나무 잎은 가로등을 받지 않음(산란광만), 야간 간판·영상 화면은 낮과 같은 발광(ADR-0078). 절대 프레임 시간(2560×1440 High 21–27 ms, 21 W)은 dev 서버 기준.
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
- 🔶 국토지리원 측량법 제30조 사용 승인(사용자 신청 — 03 §6.1) → 승인번호 받으면 ATTRIBUTION `gsi-dem`·화면 표기에 추가 후 T06
- M06 사전 2 ⚠️: 스크램블 등 PLATEAU 밖 횡단의 ≤ 0.5 m 수치 검증 — 고해상도 정사영상(유료·별도 라이선스 가능) 도입 여부.

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [x] GitHub Environment `production` 생성 + Required reviewers 지정
- [x] workers.dev 서브도메인 등록 — staging: https://tokyo-sanpo-staging.kolom1357.workers.dev (`/api/health` 정상)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — 컴파일러 완료(M07-T02), 키는 환경 변수 `ODPT_CONSUMER_KEY`로만(파일·로그 금지) → `pnpm pipeline fetch --source odpt-tokyometro --update-lock`
- [x] 파이프라인 빌드 머신(16 GB+ RAM, Docker) — 로컬 Windows PC + Docker Desktop(16코어, 16 GB 할당)
- [x] 국토지리원 기반지도정보 DEM 다운로드(533935·533945, DEM1A/5A 2025-08-22)
