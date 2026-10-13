# ADR-0085: 머티리얼 선컴파일을 첫 표시 뒤로 + e2e 상태 스펙 640×360·lod-continuity 축소(CI 15분 상한 여유)
- Status: Accepted (M09·M07 사람 확인 후속)
- Date: 2026-10-13

## Context
- 실제 GPU 첫 표시가 M06 7.2–7.9 s → M09 뒤 10.2–11.9 s(staging). 로컬 실측(RTX 3050 Laptop 24.7 W, vite build + preview, world-mini): 선컴파일 "대기 LUT" 4.8–5.2 s + 머티리얼 10종 3.8–4.0 s **직렬** → 첫 표시 9.2–9.8 s.
  분해: "대기 LUT" 단계의 대부분은 LUT(0.1–0.3 s)가 아니라 `compileAsync(scene)` — 첫 **조명 셰이더 파이프라인 1개가 ≈ 3.3 s**(어느 메시든 처음 컴파일하는 쪽이 짊어짐 — 조명·그림자·대기광·
  비 젖음이 붙은 큰 셰이더), 다음 변형 ≈ 0.3–1 s, 나머지 캐시. 머티리얼 단계는 같은 시각 스폰 셀을 실제 메시로 컴파일하는 `compileStaged`(3.5 s)와 GPU 컴파일을 다퉜다(`?premat=0` 실험: compileStaged 1.8 s, 첫 표시 6.0 s).
- CI e2e(필수 체크 "e2e (playwright chromium · world-mini)", 15분): 같은 잡이 6.2–15.3분(M05부터 편차 큼). 최근 실패·취소 = 느린 러너에서 lod-continuity 7.0분 시간 초과 + 재시도,
  군중 dummy·오디오 90 s 시간 초과 + 재시도. SwiftShader에선 부팅 ≈ 2.8 s(선컴파일 0.7–1.1 s)로 작고 **프레임 비용(1.6–2.6 fps @ 1280×720)**이 지배.

## Decision
1. render `precompile()` = 대기 LUT + 장면 컴파일 + 아바타(첫 표시 전), 새 `precompileLate()` = 머티리얼 ID별 기본·HLOD 변형(소품 풀 priming 포함, 묶음마다 한 프레임 양보) — 게임이 `commitStaged` 직후 비동기 호출.
   소프트웨어 래스터(SwiftShader)는 precompileLate 생략. 스폰 셀(보이는 것)은 compileStaged가 이미 만든다 → 첫 표시 뒤 새로 스트리밍되는 셀만 precompileLate 완료 전(≈ 7.5 s)이면 첫 사용 컴파일.
2. 첫 표시 경로 보충: 스트리밍 exclusive를 선컴파일 끝이 아니라 **첫 표시(commitStaged)까지** 붙잡는다(선컴파일이 짧아지자 첫 표시 전 몇 초에 이웃·HLOD 선적재가 쌓여 첫 로드 26 → 75–94 MB였다).
   스폰 셀이 오는 동안 대기 그룹을 0.5 s마다 미리 compileStaged(`world-parts.ts warmStaged` — 다운로드·디코드와 셀 셰이더 컴파일을 겹침, 준비되면 간격 대기 즉시 끝).
3. e2e: 상태만 보는 스펙(boot·audio·crowd·decode·physics·walk) 화면 640×360(`STATE_VIEW` — 픽셀 ¼). lod-continuity 거리 100·34·16 m(60 m = 100 m와 같은 LOD1 띠 — 뺌), 안정 뒤 대기 프레임 3·2·2 → 2·1.
   군중 dummy 상한 150 s(판정은 상태). 잡 이름·분할(shard)·워커 수(2)는 그대로.

## Consequences
- 로컬 실제 GPU(world-mini, preview): 첫 표시 9.2–9.8 s → 6.1–6.7 s. staging(MVP, 2560×1440, 전력 상한 22–39 W): walk 시작 7.3–8.2 s, 골든 부트 지표(data-rendered-cells) 8.3–9.0 s(전 10.2–11.9 s), 첫 로드 26.4 MB ✅.
  ⚠️ 골든 지표는 M06(7.2–7.9 s)보다 ≈ 0.6–1 s 느리다 — 남은 임계 경로 = 첫 조명 셰이더 ≈ 3.3 s(선컴파일)와 스폰 셀 75묶음 ≈ 2.8 s(compileStaged)가 GPU 프로세스 컴파일을 나눠 쓴다. 첫 표시 뒤 precompileLate 7.3–7.6 s 동안 새 긴 프레임 없음(첫 프레임 render ≈ 0.6 s는 전과 같음 — 후처리 파이프라인, 별도).
- 로컬 e2e(SwiftShader 헤드리스, 워커 2, 16코어): 5.0분 → 3.0·3.3분(연속 2회). CI(4 vCPU)는 같은 비율이면 느린 러너 11.5분 → ≈ 7분.
- 첫 조명 셰이더 3.3 s는 남는다(셰이더 크기 — 조명 노드 정리·병렬 파이프라인 생성은 후속).
