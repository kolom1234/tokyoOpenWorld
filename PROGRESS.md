# PROGRESS
Updated: 2026-09-30 (session #16 — 큐 모드 ① M03 보강 → ② M04 T01–T06, 브랜치 `claude/m03-fixes-m04`, draft PR 1개)

## Current Milestone: M04 — Physics & Walking (M03 보강 5항목 완료)
## Current Task: M04-T04 Stairs, curbs, escalators, ground material — 큐: M04-T01 ✅ → T02 ✅(MVP 적재 틱 수정 ✅) → T03 ✅ → T04 → T05 → T06
- Done in this session: M03 보강 ① 정지 화면 떨림(ADR-0038), ② 렌더 고정 비용(ADR-0039), ③ 품질 감지 재검증(코드 변경 없음), ④ WebGL2 파사드 어두움·flaky e2e(ADR-0040), ⑤ 밤 창 전부 점등 → Known Issue(M09-T03). M04-T01 물리 워커(ADR-0041), M04-T02 셀 콜라이더(ADR-0042), M04-T03 캐릭터·walk(ADR-0043).

- 측정 스크립트(세션 scratchpad, 커밋 안 함): `flicker.mjs`(실제 GPU Chrome, `?debug=1` 핸들로 카메라 고정·회전·이동 → 루프 직후 캔버스 복사 → 연속 프레임 휘도 차),
  `dynres.mjs`(동적 해상도 시계열), `swflicker.mjs`(SwiftShader forcePost), `perf.mjs`(무제한 프레임 rAF p50·전력 상한·패스별 GPU, `PROT=1` 회전). 방법은 ADR-0038 Context에 기록.
- 배포 상태: staging = b386e8e 코드(M03 보강 ①–⑤, 2026-09-30) + dev 버킷 빌드 `20260929-b84bfa1-ec1646fc`(변경 없음). 옛 빌드 gc는 10/6 이후(7일 규칙).
  MVP 로컬 재빌드 `20260929-99bffa8-ec1646fc`(collision.bin 포함, L0 294셀 144.5 MB, 검증 오류 0) 완료 — dev 버킷 publish·staging 배포는 적재 틱 수정 뒤.
- 보행 봇(scratchpad `walkbot.mjs <url> <분> <시드>`): 실제 입력(키 W/X/Shift, 합성 포인터 드래그 회전)으로 스폰(스크램블) 반경 110 m 자유 보행, 끼임 후보(10 s < 1 m) → 8방향 탈출 시도로 막다른 곳/끼임 분류.
- Next step (정확히 한 걸음): M04-T04 초안 적용(scratchpad `t04-drafts/apply_t04.py` — escalators·primitives·inline-transport·테스트 2개·ADR-0044) → cell-colliders `jobsOf`에 프리미티브·에스컬레이터 등록 손으로 추가 → first-person-rig 발 높이 임계 감쇠 스프링.
- Blockers: 없음

## Recently Completed
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
- M03 보강 ① 정지 화면 떨림 — 원인 실측: TAA 끄면 0, GTAO 끄면 1/13 → **GTAO 시간 노이즈(useTemporalFiltering)를 TAAU가 다 못 섞음**(노출·그림자·SSR·Bloom·렌더 스케일·정밀도 무관).
  수정: GTAO 고정 노이즈 + `post/ao-filter.ts` 5×5 깊이 인지 블러(AO 해상도 RTT). 정지 근경 0.592 → 0.082(|Δ휘도|), 스크램블 원경 0.113 → 0.037, 이동 근경 1.41 → 0.44.
  e2e `flicker.spec.ts`(`?forcePost=1` — SwiftShader에서 GTAO+TAAU, 수정 전 0.204 실패 / 후 0.115 통과, 임계 0.15). `RenderConfig.debugForcePost`. 테스트 +1건·e2e +1. ADR-0038 (2026-09-30)
- M03-T09 WebGL2 fallback parity — backend-caps 소프트웨어 래스터 판정(SwiftShader·llvmpipe → 직접 렌더 유지), **하드웨어 WebGL2 = 같은 후처리 + 환경 프로브 + CSM 그림자**,
  Medium 상한(T08), 자동 노출(컴퓨트) 끔 → 고정 1.25, 유리 거칠기 하한 0.16(거울 띠 과다 보정), TSL `packNormalToRGB/unpackRGBToNormal`(r186 이름).
  **수락**: `?backend=webgl` 실제 GPU 골든 5뷰(`docs/screenshots/M03/T09-webgl2/`) 오류·경고 0, tier medium·GTAO 적용. 남은 차이: 일부 금속·커튼월 파사드가 더 어둡다(후속).
  e2e(SwiftShader) 5/5 불변. 테스트 +1파일/+1건. ADR-0037, ADR-0028 부록 (2026-09-29)
- M03-T08 Quality tiers & dynamic resolution — render `quality.ts`(detect-gpu 벤치마크 자체 호스팅 `/detect-gpu/` → low/medium/high, WebGL2 상한 medium, 60프레임 측정 뒤
  동적 해상도 바닥에서도 느리면 한 단계씩 강등, 버스 `quality/changed` 양방향), `renderer/dynamic-resolution.ts`(EMA 17.5/17.1 ms, ±0.05, 시도-후퇴 백오프),
  post `setRenderScale`(PassNode·RTT·GTAO·SSR, TAA는 항상 TAAU), API `setQuality`·`detectQuality`·stats `quality`·config `dynamicResolution/gpuBenchmarksPath/debugGpuLoad`.
  game `wiring/quality.ts`(localStorage `sanpo.quality.v1`, 첫 표시 뒤 감지), `?dynres=0`·`?gpuLoad=n`, vite `sanpo-gpu-benchmarks`. 골든뷰 = High 고정·동적 해상도 끔.
  **수락**(3050 Laptop): 1080p Medium + gpuLoad 200 — 고정 0.75 = 22.4 ms → 동적 0.5 ≈ 16.7–18.6 ms(렌더 스케일 하강 ✅, 16.6 ms 완전 유지 ✗ — 해상도 무관 고정 비용).
  1440p High는 0.5에서도 ≈ 23 ms(TAAU 해석 ≈ 8 ms 고정). detect-gpu: RTX 3050 Laptop → tier 3 → high. 테스트 +3파일/+9건. ADR-0036 (2026-09-29)
- M03-T07 Post pipeline — render `post/{pipeline,config,exposure,lut}.ts`: MRT(output·normal+roughness·velocity·[diffuse+metalness], 24 B) → GTAO/SSGI → SSR(가산) →
  aerialPerspective → 컴퓨트 자동 노출(부분 적응) → Bloom(¼) → TRAA/TAAU(렌더 스케일) → renderOutput → 절차 3D LUT → Sharpen. API `QualityTier`·`PostEffects`·
  `RenderConfig.quality/post`·stats `post/exposure`, game `?quality=`·`?post=`(`debug/post-flags.ts`). 티어: Low 0.6 / Medium 0.75 GTAO / High 0.85 GTAO+SSR+Bloom / Ultra 1.0 SSGI+Sharpen.
  **SSGI는 Ultra만**(r186 해상도 배율 없음, +100 ms↑ — 07 §9 이탈). **성능 미달**: 1440p 3050 Laptop 스크램블 모두 끔 25.9 → High 35.9 ms(3060 환산 순증 ≈ 4.3 ms,
  공중원근 포함 ≈ 7 ms > 4 ms). 안 빼기: GTAO 3.5·Bloom 3.0·Sharpen 2.2·SSR 1.6·노출 0.6·LUT 0.5, 공중원근 ≈ 6, TRAA ≈ 8.
  골든 `docs/screenshots/M03/T07/*`(노출 배율 metrics). 테스트 +2파일/+4건. ADR-0035 (2026-09-29)
- M03-T05 Glass & interior mapping — pipeline `materials/{interior-rooms,interiors}.ts`(방 8종 상자 가구·조명판 → 방 중심 6면 광선 추적 → 256² PNG 48장 →
  `interiors.ktx2` ETC1S 2D 배열 0.14 MB, manifest `interiors`, 스키마·validate), `lib/png.ts` RGB 인코더. render `facade/interior.ts`(베이×층×깊이 방 상자 교차 →
  면·LOD, 창별 방·좌우 반전, 유리 픽셀에서만 `If` 분기), `materials/glass.ts`(실내 발광 × (1−프레넬) × 투과율, 블라인드 확산면), library `maps.interiors`·방 평균색.
  **수락**: `docs/screenshots/M03/T05/shinjuku-curtainwall-close.jpg`(서신주쿠 초고층 근접 — 창마다 실내·블라인드·소등 방), `class-mansion.jpg`(가구 실루엣 깊이감) — 육안.
  **성능**: 파사드 단색 대비 ≈ 6.0 ms(T04 4.7 → +1.3, 분기 전 +2.7). core GPU 23.8/22.9/24.9/28.7 ms. 새 골든뷰 `shinjuku-curtainwall-close`. 테스트 +1파일/+4건. ADR-0034 (2026-09-29)

## Known Issues
- [traversal] 게임 시작은 freecam(골든뷰·e2e 결정론) — C로 걷기. 09 §1 "walk = 기본"은 M08 스폰 흐름에서 재검토(ADR-0043).
- [physics] 셀 콜라이더 = 건물(0.3 m 단순화) + 높이장만. 연석·계단(M04-T04)·소품·나무 줄기(M05) 없음. CI(SwiftShader)에선 워커가 CPU 경합으로 적재 틱 22 ms까지(기록만).
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
- [ci] e2e = 부트·월드 로드(`boot.spec.ts`) + 렌더 스모크(`render.spec.ts`, WebGL2/SwiftShader 강제) + 디코드 워커(`decode.spec.ts`, `?probe=decode`). WebGPU 경로는 CI에 GPU가 없어 미검증 → 로컬 실제 GPU(Chrome headed, `channel: 'chrome'`)로 확인(2026-09-29). 걷기·모드 전환은 M04 이후. staging `smoke.sh`는 아직 `/fixtures/world-mini/world.json`을 검사하지 않는다.
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
