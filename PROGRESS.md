# PROGRESS
Updated: 2026-09-30 (session #16 — 큐 모드 ① M03 보강 → ② M04 T01–T06, 브랜치 `claude/m03-fixes-m04`, draft PR 1개)

## Current Milestone: M04 — Physics & Walking (M03 보강 5항목 완료)
## Current Task: M04 완료(T01–T06, draft PR #16) → 다음 = M05-T01 Roads, sidewalks, curbs, terrain shaping (사용자 확인 대기: Quaternius 아바타 다운로드 승인)
- Done in this session: M03 보강 ① 정지 화면 떨림(ADR-0038), ② 렌더 고정 비용(ADR-0039), ③ 품질 감지 재검증(코드 변경 없음), ④ WebGL2 파사드 어두움·flaky e2e(ADR-0040), ⑤ 밤 창 전부 점등 → Known Issue(M09-T03). M04-T01 물리 워커(ADR-0041), M04-T02 셀 콜라이더(ADR-0042), M04-T03 캐릭터·walk(ADR-0043), M04-T04 계단·에스컬레이터·지면 재질 엔진(ADR-0044), M04-T05 3인칭 카메라 충돌·아바타(ADR-0045), M04-T06 앵커 재설정·발밑 보호(ADR-0046).

- 측정 스크립트(세션 scratchpad, 커밋 안 함): `flicker.mjs`(실제 GPU Chrome, `?debug=1` 핸들로 카메라 고정·회전·이동 → 루프 직후 캔버스 복사 → 연속 프레임 휘도 차),
  `dynres.mjs`(동적 해상도 시계열), `swflicker.mjs`(SwiftShader forcePost), `perf.mjs`(무제한 프레임 rAF p50·전력 상한·패스별 GPU, `PROT=1` 회전). 방법은 ADR-0038 Context에 기록.
- 배포 상태(2026-09-30 21:2x): staging = **0dc0075 코드(M04 전체: walk·3인칭·아바타·발밑 보호)** + dev 버킷 current **`20260929-99bffa8-ec1646fc`**(collision.bin 포함, 478파일 260.5 MB, Worker HEAD 전수 검증).
  인증 = 사용자 환경변수 `CLOUDFLARE_API_TOKEN`(wrangler도 이 토큰 사용 — whoami "User API Token"). 실제 GPU로 staging 부트 → C → 걷기 1.35 m/s 확인. 옛 빌드 gc는 10/6 이후(7일 규칙).
- ⚠️ 2026-09-30 19:32 PC 재부팅(비정상 종료 추정) → `.git/refs/heads/claude/m03-fixes-m04`가 NUL 41바이트로 손상 → reflog·origin 모두 f031f80이라 파일에 직접 복구(백업 scratchpad `broken-ref.bin`), `git fsck` 오류 없음.
- 보행 봇(scratchpad `walkbot.mjs <url> <분> <시드>`): 실제 입력(키 W/X/Shift, 합성 포인터 드래그 회전)으로 스폰(스크램블) 반경 110 m 자유 보행, 끼임 후보(10 s < 1 m) → 8방향 탈출 시도로 막다른 곳/끼임 분류.
- In progress: 없음(모든 변경 커밋·푸시, 작업 트리 깨끗).
- Next step (정확히 한 걸음): `docs/roadmap/M05.md`의 `### M05-T01` 블록 읽기 → 04 §4.3(지형 성형·연석)·§6 → `tools/pipeline/src/stages/derive/` 신설(도로·보도 폴리곤 = 이미 normalize된 PLATEAU TrafficArea).
  사용자가 Quaternius 다운로드를 승인하면 먼저 아바타 교체(render `scene/avatar.ts` 자리, 03·ATTRIBUTION 갱신).
- Blockers: 없음

## Recently Completed
- M04-T06 Anchor rebase & ground-missing guard — physics `setFocus`(배선 250 ms) → 4096 m 초과면 `rebase` 명령: 워커가 적재된 모든 바디·캐릭터·에스컬레이터 구간 −Δ, 앵커 객체 제자리 갱신, OptimizeBroadPhase.
  traversal `ground-guard.ts`: 발밑 L0 미적재 = **hold**(캐릭터 입력 — 중력·이동 없음), 제동 거리 + 0.6 m 앞 셀 미적재 = **stop**, `hud.groundLoading` → 게임 `wiring/ground-loading.ts`(0.2 s 넘으면 "지면 불러오는 중…").
  잠재 버그 2개 수정: 작업 없는 셀이 영영 미적재, streaming 본문 도중 취소 시 `cancel()` 미처리 거부("signal is aborted without reason").
  **수락**(실제 GPU, MVP, CDP Fast 3G 1.44 Mbps·562 ms): 걷기 31,303 프레임 **낙하 0**, 대기 4회, 1.4–1.6 km 순간이동 = 공중 고정 → 17.6–18.6 s 착지, 북쪽 끝 z −4200 = **앵커 재설정 1회**(0,0,−4096) →
  Fast 3G 단독 ≈ 32 s 착지(스로틀 없이 2.5 s). ⚠️ 순간이동 연속 시 큐 적체로 발밑 L0 지연(4분+, 낙하 없음) → M08 transition. 테스트 +1파일(rebase-hold) +1건(walk 보호). ADR-0046 (2026-09-30)
- M04-T05 Camera collision & avatar — physics `sphereCast`(워커 CastShape 구·양면), traversal 3인칭: 카메라 시선 프레임당 ≤ 8° + **부채꼴 5개 sphereCast**(가운데·yaw ±8°·pitch ±8°, r 0.2 m)로
  다음 프레임 붐 한계(1프레임 비동기 보상, 당기기 즉시·풀기 4 m/s), 붐 0.5–1.2 m 아바타 디더 페이드. render `setAvatar`: **자체 절차 마네킹**(캡슐·구, 속도 블렌드 대기·걷기·달리기, 선컴파일) — core `AvatarState`.
  **수락**(실제 GPU, MVP, 봇이 찾은 막다른 골목 8곳 × 25 s, 홱 돌리기·걷기·줌, 매 프레임 피벗 → 카메라 구 0.1 m 캐스트): **12,600 프레임·검사 10,083회 관통 0**
  (첫 구현 = 목표 방향 1개 질의는 관통 발생 → 부채꼴·회전 상한으로 수정). ⚠️ Quaternius 모델은 외부 다운로드 → 사용자 승인 뒤 교체. 테스트 +2파일(render avatar, sphereCast). ADR-0045 (2026-09-30)
- M04-T04 Stairs, curbs, escalators, ground material(엔진) — 워커 JCOL 프리미티브(박스·캡슐·원기둥) 정적 바디, userData = 재질 | flags << 8(`groundMaterial` 하위 8비트),
  **에스컬레이터 = JCOL SENSOR 박스 flags bit2**(05 §6 확장, 로컬 +Z 진행) OBB 목록 → 발이 안이면 진행 방향 0.5 m/s + 걷기 수평 ≤ 0.6, `Pose.escalator`(헤드밥 끔; 수직 속도 누적 버그는 테스트로 잡아 수정),
  카메라 발 높이 = 임계 감쇠 스프링(ω 12), `createInlineTransport()` 공개. **수락(합성)**: 실제 Jolt + traversal — 연석 0.15 m·계단 0.18 m 카메라 프레임당 **최대 1.58 cm**(< 3 cm ✅),
  계단 오르내림 1/6 s 창 ≥ 0.9 m/s·접지, 램프 프록시 프레임당 높이 < 1 cm, 에스컬레이터 0.45–0.55 m/s. ⚠️ 시부야 육교 왕복은 **데이터 없음**(PLATEAU brid·OSM steps 미수집, 연석 = M05-T01) → M05-T08 신설. ADR-0044 (2026-09-30)
  + 워커 **빈 시간 적재**(메시지 사이 setTimeout 조각 — 부록 A의 잘게 나눈 작업이 SwiftShader e2e 60 s를 넘겨 physics·walk e2e가 깨졌던 것 수정, 4 spec 52 → 38 s) + 조각 예산 **3 ms**
  (실제 GPU 봇 4분: 4 ms = 최대 8.3 ms·초과 1 → 3 ms = **최대 6.19 ms·초과 0**, 끼임·낙하 0, 걷기 1.349 m/s). ADR-0042 부록 B.
- M04-T02 보강: MVP 보행 중 적재 틱(최대 20.4 ms·8 ms 초과 54회 — Node MVP 30셀 높이장 최대 9.0·2500 삼각형 최대 7.0 ms, 브라우저 렌더 경합 2–3배) →
  워커가 작업을 더 잘게: 높이장 **4×4 타일**(65², 가장자리 공유), triMesh **≤ 600 삼각형 조각**(쓰는 정점만 압축, `meshSlice`). 실제 GPU 봇 4분: **최대 6.18 ms·초과 0회**(2×2·800은 8.65 ms·1회). 재빌드 불필요. ADR-0042 부록 A (2026-09-30)
- M04-T03 Character & walk mode — physics `worker/character.ts`(CharacterVirtual r 0.25·키 1.70·경사 50°·계단 0.40·바닥 붙기 0.5·예측 0.1·양면, 가속 8/감속 10, ExtendedUpdate), 슬롯 공유(bodies Entry rigid|char),
  API `spawnCharacter`·`setCharacterInput`(프레임 마지막 입력만), traversal `modes/walk.ts`(걸음 단계 X 1.35/1.8/3.0·Shift 5.0, FP/TP V, 하늘 레이 착지 `walk-placement.ts`, C 토글 = 카메라 포즈 전달·150 m 안이면 바디 복귀),
  `camera/{first,third}-person-rig.ts`(시선 스무딩 30 ms·발 높이 추종·헤드밥 / 어깨 0.4·거리 3.5·휠), FSM 요구조건 요청 때 평가(physics getter), input 게임패드(`devices/gamepad.ts` 폴링·원형 데드존·`padButton{hold}`·`padAxis{perSecond}`·`padButtonAxis`).
  **수락**(실제 GPU Chrome, MVP 재빌드, `?world=local`, 봇 10분 × 2회): 걷기 속도 중앙값 **1.348 / 1.349 m/s**(p10 1.331/1.308·p90 1.359), 낙하 **0 / 0**, 평균 59.7 / 59.8 fps.
  끼임: 1회차 후보 4(건물 틈, 분류 없음) → 2회차 8방향 탈출 시도로 분류: 후보 7 = **모두 막다른 곳**(0.7–2.6 m 걸어 나옴), **물리 끼임 0**.
  e2e `walk.spec.ts`(SwiftShader: 착지·눈높이·1.35 m/s·V·C 왕복). 테스트 +4파일. ADR-0043 (2026-09-30)
- M04-T02 Cell colliders — pipeline `stages/build/collision.ts`(건물 면 1 mm 용접 → meshopt simplify 절대 0.3 m → 64 m 블록 순 **≤ 2500 삼각형 청크** JCOL triMesh, TKC `colliderTris`),
  워커 `cell-colliders.ts`(셀 = [높이장, 청크…] 작업, 틱 예산 4 ms·예상 비용 판단·워밍업, 정적 바디 userData = 재질), `heightfield.ts`(힙 직접 채움), `queries.ts`(레이캐스트 **양면** — PLATEAU 감김 불일치),
  API `addCell/removeCell/hasCell/raycast`·stats 적재 지표, 게임 `wiring/streaming-physics.ts`(버스 `cell/ready` — onReady는 렌더 단독, 물리 반경 256 m 등, 동시 2). 픽스처 재생성.
  **수락**: 실제 GPU Chrome(world-mini) 적재 틱 최대 **5.8 ms**, 8 ms 초과 0. 지면 레이 오차 ≤ 0.4 mm(Node·브라우저), 벽 = JCOL CPU 교차 ±5 cm. 테스트 +3·e2e +1. ADR-0042 (2026-09-30)
- M04-T01 Physics worker bootstrap — `@sanpo/physics`: jolt-physics 1.1.0 **single-thread**(multithread는 Vite 중첩 pthread 워커 번들 실패·초기화 3 s → 08 §1 이탈),
  메인 구동 고정 스텝(phase 30 → step(targetS, 명령) → 워커 120 Hz·틱당 ≤ 4), SAB 더블 버퍼 + seqlock / 폴백 postMessage, 보간(지금 − 25 ms, nlerp, 10 m 순간이동 스냅),
  레이어·충돌 행렬(08 §3), 핸들 = 슬롯 | 세대, `debugSpawnBox`, 게임 `?probe=physics`(+`physicsIsolation=degraded`), vite `worker.format = 'es'`.
  **수락**: Node 통합(SAB·폴백) 스냅샷 시각 보간 = 워커 값, 사이 = 선형, 바닥 정지 0.48 m. e2e(프로덕션 preview): shared·degraded 초기화 84–90 ms, 3 s 360스텝, 틱 0.03–0.07 ms. 테스트 +9건·e2e +2. ADR-0041 (2026-09-30)
- M03 보강 ④ WebGL2 파사드 어두움 = **GTAO 위치 복원 오류**(AO 끄면 두 백엔드 동일): three `getViewPosition`이 역-Z(EXT_clip_control 0..1) 깊이를 −1..1로 변환 →
  `patches/three@0.186.1.patch`로 역-Z 분기(서신주쿠 파사드 36.0 → 56.2, WebGPU 56.4). flaky e2e = 원점 재설정: `rebaseTest`가 1 s 시간만 머물러 저 FPS에서 재설정 없음 +
  복귀 직후 재적재·페이드 중 캡처 → 재설정 횟수 대기, 오버레이 `data-settled`, 640×360·180 s. 4 병렬 × 8: 8/8 실패 → 8/8 통과. `?post=exp:`. ADR-0040 (2026-09-30)
- M03 보강 ③ 자동 품질 감지 재검증(15 W, 새 프로필, 회전 120 s, scratchpad `tiercheck.mjs`): 1080p = detect-gpu high → **High 유지**(동적 해상도 0.5–0.85),
  1440p = High → 18.5 s "0.5에서 21.1 ms" → **Medium 한 단계만**, 이후 유지. High→Low 연쇄 하강 없음(75629ce 워밍업·스트리밍 조용함 대기 + ② 성능 개선) (2026-09-30)
- M03 보강 ② 렌더 고정 비용 — 그림자 07 §9 티어(Low 2×1024·150 m … Ultra 4×4096·800 m) + 캐스케이드 갱신 스케줄(움직일 때 c0 매 프레임 + 먼 것 하나, 정지 15프레임마다 하나),
  저해상도 공중원근(`post/aerial.ts` ½×½ MRT S·T → 깊이 인지 업샘플, 윤곽·지평선 급경계는 정확 계산, 태양·달 원반만 렌더 스케일; `PostEffects.aerial`), 파사드 깊이 프리패스 쌍둥이,
  HLOD 불투명/페이드(alphaHash) 변형 전환, GPU 타이머 패스별 분해. **15 W 실측**(rAF p50, 5뷰): 1080p Medium 정지 18.6–21.6 → 14.3–16.6 ms, 회전 19.1–22.2 → 15.4–17.0,
  1440p High 정지 33.6–40.0 → 25.9–30.2, 회전 33.8–40.3 → 27.3–31.4. 테스트 +6건. ADR-0039 (2026-09-30)

## Known Issues
- [physics] 육교·계단·연석·에스컬레이터 **데이터 없음** — 엔진(M04-T04)만. 연석·보도 = M05-T01, 육교·계단 = M05-T08(PLATEAU brid + OSM steps → 램프 프록시), 역 에스컬레이터 = M07 역 오버라이드. 지형 재질 = asphalt 고정(`_SURF` 재질은 M05-T01).
- [streaming] 순간이동을 이어 하면 이전 목적지 작업이 큐(동시 8·대기 16)에 남아 스로틀에서 새 발밑 L0가 늦게 온다(Fast 3G 3번째 순간이동 뒤 4분+ 공중 고정 — 낙하 없음). 발밑 L0 우선·이전 목적지 취소는 M08 transition(`whenReady`)과 함께(ADR-0046).
- [e2e] 로컬 `pnpm test:e2e`(기본 워커 = 코어 절반 = 4)는 이 노트북(15 W 전력 상한)에서 SwiftShader 경합으로 불안정(render·flicker·decode·walk가 번갈아 시간 초과) → `--workers=2`(CI 러너와 같음)로 10/10 통과(2026-09-30).
- [avatar] 3인칭 아바타 = 자체 절차 마네킹(캡슐). Quaternius 베이스 아바타(09 §3)는 외부 다운로드라 사용자 승인 필요(파일·출처·크기 확인 → 03·ATTRIBUTION 갱신) — ADR-0045.
- [traversal] 게임 시작은 freecam(골든뷰·e2e 결정론) — C로 걷기. 09 §1 "walk = 기본"은 M08 스폰 흐름에서 재검토(ADR-0043).
- [physics] 셀 콜라이더 = 건물(0.3 m 단순화) + 높이장만(소품·나무 줄기 = M05). CI(SwiftShader)에선 워커가 CPU 경합으로 적재 틱이 길다(기록만).
- [render] 밤에 모든 건물 창(실내 매핑 발광)이 켜진다 — 창 점등 스케줄(용도·시각·층별 확률, `facade-params` 야간 점등 단계)은 **M09-T03**(Night lighting)에서. M03 보강 ⑤ 결정(2026-09-30).
- [render] 동적 해상도는 60 Hz 수직 동기에서 여유를 못 재 "시도-후퇴"로 0.05씩 오르내린다(15 W 1080p High: 120 s에 19회, 0.5–0.85). 정지 떨림에는 영향 없음(ADR-0038 측정) — 선명도 변화가 거슬리면 시도 간격·히스테리시스 조정.
- [perf] **이 PC GPU 전력 상한이 15 W ↔ 30 W로 바뀐다**(LG gram 17 17ZD90R, RTX 3050 4GB Laptop, 기본 30 W·최대 45 W, 전원 모드 최고 성능) — 15 W에선 2배 느림.
  측정은 행마다 `nvidia-smi enforced.power.limit` 기록. 15 W 기준 1080p Medium 회전 15.4–17.0 ms(2뷰가 16.6 ms 살짝 초과 → 동적 해상도가 흡수), 30 W 8–9 ms(ADR-0039).
- [perf] WebGPU 타임스탬프 합은 실제 프레임의 ≈ 1/4(클럭 비율) → 비중(`stats().gpu.passes`)만 신뢰, 절대값은 무제한 프레임 rAF p50. `pnpm perf`(M02-T07~)에 반영 필요.
- [render] TAAU(1080p Medium ≈ 12 %)는 three 패치 없이 경량화 불가 → 동적 해상도로 흡수(ADR-0039). L0 반경 축소(HLOD 우선)도 보류.
- [render] 정지 화면 원경 수평선 부근 서브픽셀 건물 윤곽의 TAAU 재구성 반짝임 잔존(>12 단계 0.047 % 픽셀, ADR-0038). 대안: TAAU 분산 감마 1.5 패치(−30 %, 고스팅 위험), 원경 윤곽 사전 필터링.
- [perf] 첫 표시 ≈ 11 s(12 s 목표 근접) — 선컴파일 ≈ 5 s·대기 LUT. 첫 표시 직후 HLOD 1–2 s 디졸브(ADR-0033). T07/T08에서 선컴파일 병렬화 검토.
- [render] 지면 `_SURF` 7(plaza)이 공원·녹지까지 덮음(요요기 콘크리트색), 도로 가장자리 1 m 계단 — M05 토지이용·도로 메시 전까지.
- [pipeline] PLATEAU 동일 평면 중복 면 z-파이팅 잔존(WebGL2 원점 재설정 e2e ≈ 70 px). 벽–벽 중복 제거는 필요 시 M05-T07.
- [render] takram 패치 + three 패치(`getViewPosition` 역-Z, ADR-0040)는 three r186 전용 — three/takram 버전을 올리면 패치 재확인.
- [pipeline] GSI DEM 2025판 표고는 JGD2024(2025 개정) 기준, PLATEAU는 JGD2011 → LOD3 차도 정점 vs dem_1m 차 중앙값 +0.05 m(IQR −0.03~+0.18, p95 +8.2 m = 고가도로). M01-T05는 도로 메시 없음 → M03 도로 빌드 때 도로면 우선 스냅 여부 결정.
- [pipeline] `fetch` 미구현 → zip에서 필요한 것만 수동 해제(`data/raw/plateau-{shibuya,shinjuku,meguro}/extracted/`: MVP 24메시 udx/bldg·tran + codelists + schemas, 2026-09-29). 23구 zip은 풀지 않음(hlod-prep 스트림). 標高タイル은 hlod-prep이 받음. fetch 구현 시 lock sha256 검증.
- [pipeline] `normalizePlateau`는 대상 셀 버킷을 메모리에 모두 보유 → MVP 294셀은 `NODE_OPTIONS=--max-old-space-size=12288`로 통과(2026-09-29). 23구 전체 L0로 넓힐 때 셀별 스필 필요.
- [pipeline] 건물 셀 배정 중심점 = 모든 면 정점 평균(installation 포함). M01-T05 실측: 셀 밖 돌출 최대 68.2 m(L0_-1_0, 허용 256 m) → 유지. 발자국 기준 전환은 294셀 빌드에서 문제가 보이면.
- [pipeline] 도로 레코드는 TrafficArea 단위로 매우 잘게 나뉨(3×3에 27.7k) → M03 도로 메시 빌드 시 병합/삼각분할 비용 확인.
- [ci] e2e = 부트·렌더 스모크·디코드·정지 떨림·물리(워커·셀 콜라이더)·걷기(`walk.spec.ts`) — WebGL2/SwiftShader. WebGPU 경로·실제 성능·골목 카메라·3G 보행은 로컬 실제 GPU 스크립트(세션 scratchpad `walkbot/campen/throttle.mjs`)로 확인. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
- [e2e] 클라우드 세션 Chromium은 Playwright 번들 버전과 달라 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`로 실행. 실행 전 떠 있는 `vite preview`가 있으면 `reuseExistingServer`로 **옛 빌드**를 테스트하니 먼저 종료할 것.
- [perf] 초기 다운로드(첫 표시 시점 전송량) 57–62 MB — 14 §2 예산 60 MB 경계. 부팅 순서상 L3 9·L2 ~36·L1 ~16이 스폰 L0보다 먼저 온다(06 §8). 초과가 이어지면 부팅 whenReady 전 L2 반경 축소 또는 HLOD 크기 조정(M03 perf 하네스 `pnpm perf`에서 판단).
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
- [tile-format] `props.inst`·`trees.inst`·`lights.bin`·`audio.json` 인코더/디코더 미구현(레지스트리·모델 타입만) → 해당 태스크(M04~)에서 추가. 헤더 gzip(flags bit0)은 v1 미지원(ADR-0017).
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

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [x] GitHub Environment `production` 생성 + Required reviewers 지정
- [x] workers.dev 서브도메인 등록 — staging: https://tokyo-sanpo-staging.kolom1357.workers.dev (`/api/health` 정상)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [x] 파이프라인 빌드 머신(16 GB+ RAM, Docker) — 로컬 Windows PC + Docker Desktop(16코어, 16 GB 할당)
- [x] 국토지리원 기반지도정보 DEM 다운로드(533935·533945, DEM1A/5A 2025-08-22)
