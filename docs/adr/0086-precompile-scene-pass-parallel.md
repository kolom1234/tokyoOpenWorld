# ADR-0086: 선컴파일을 씬 패스 대상(MRT·TAAU 속도 투영)으로 + 파이프라인 병렬 생성(three 패치) + 셀 기본 머티리얼 조기 컴파일
- Status: Accepted (M08 세션 ① 첫 표시 개선)
- Date: 2026-10-17

## Context
- staging 골든 부트 첫 표시 8.7–9.1 s(M06 7.2–7.9 s, ADR-0085 ⚠️). "첫 조명 셰이더 3.3 s + 스폰 셀 compileStaged 2.8 s가 경쟁"으로 보였으나,
  WebGPU 파이프라인 생성을 계측(`createRenderPipeline{,Async}` 래핑 — 라벨·시작/끝·WGSL 크기)하니 원인은 셋이었다.
  1. **변형 불일치**: `renderer.compileAsync`는 지금 렌더 타깃(= 캔버스)으로 컴파일한다. 후처리 경로에서 머티리얼은 씬 패스(MRT 4장 RGBA16F·RGBA8 ×2·RGBA16F) +
     TAAU가 자기 프레임에만 거는 `velocity.setProjectionMatrix(지터 없는 투영)`으로 그려진다 → 선컴파일한 것은 다른 변형(파사드 WGSL 121,686 vs 122,884 B,
     지형은 속도 투영 `cameraProjectionMatrix` vs `object.nodeUniform`), 진짜 변형은 첫 프레임 render에서 **동기**로 다시 만들었다(셀 75묶음 ≈ 80개).
  2. **직렬 생성**: three r186 `compileAsync`는 객체마다 노드 빌드 → 파이프라인 `await` → 양보를 **하나씩** 한다 → 셀 머티리얼 셰이더 5–7개가 앞뒤로 이어져 ≈ 2.5–3 s.
     또 노드 빌드가 호출 뒤 비동기라 전역 상태(`renderer.getMRT()`·속도 투영)를 **그때** 읽는다(호출 직후 되돌리면 MRT 없는 셰이더 → 파이프라인 검증 실패).
  3. 선컴파일 더미 메시가 `receiveShadow = false`·색인 없음 → 실제 L0 셀(그림자 받음·색인)과 캐시 키가 달랐다.
- 대기 LUT는 첫 프레임 `updateBefore`와 `prepare`에서 두 번 계산된다(임계 경로 밖 — 유지).

## Decision
1. `PostPipeline.compileTarget()` = { 씬 패스 렌더 타깃, MRT, TAAU 지터 없는 투영 행렬(같은 객체) } — 직접 렌더는 null.
   `renderer/compile-scope.ts routeCompileToScenePass`: `renderer.compileAsync`를 감싸 **컴파일이 하나라도 진행 중이면** 그 상태를 걸어 두고(참조 수 — 비동기 노드 빌드까지),
   프레임 렌더(`compileScope.frame`)만 잠깐 풀었다가 다시 건다. 대기 LUT prepare의 초기화 렌더도 캔버스 직접 렌더 대신 실제 경로(`post.warmup`, 자동 노출 상태 유지).
2. three 패치(`patches/three@0.186.1.patch`, build 2개 + src Renderer.js): `compileAsync` 루프가 파이프라인을 기다리지 않고 모아 두었다가 끝에 `Promise.all` —
   노드 빌드·양보는 그대로(메인 스레드), GPU 프로세스가 병렬로 만든다(실측 ≈ 4배 겹침).
3. `precompileBase`(첫 표시 전, 대기 LUT와 동시): L0 셀 머티리얼 5종 기본 변형 + 파사드 프리패스를 더미 메시(색인·`receiveShadow` 셀과 같게) 한 묶음으로,
   장면 밖(compileDetached와 같은 이유) — 스폰 셀이 내려받아지는 동안 GPU가 만든다. HLOD·소품 priming은 그대로 precompileLate(ADR-0085).
4. `GOLDEN_BOOT=1` 골든 테스트: `GOLDEN_BOOT_RUNS`(반복)·`GOLDEN_QUERY` 적용·부팅 로그(선컴파일·대기 셀·레이어 붙이기 ms) 기록.

## Consequences
- 로컬 실제 GPU(dev 서버, MVP 빌드 `?world=local`, 같은 전력 상태에서 번갈아 4회): 원래 9.0–10.4 s(평균 9.9) → 1+2 7.4–8.6 s(8.2) → 1+2+3 7.3–8.5 s(7.8).
  상태가 좋은 때 6.5–6.6 s(원래 6.5–7.2). 1만(직렬 그대로)은 오히려 9.0–9.4 s — 진짜 변형을 하나씩 만들기 때문(둘 다 필요).
- 남은 첫 프레임 동기 생성: 그림자 패스 변형(셰이더 48·26 KB)·첫 표시 전 장면에 들어온 HLOD·원경 지형 변형 ≈ 0.3–0.6 s. 노드 코드 생성이 빌드 순서에 따라
  유니폼 배치·이름이 달라져(같은 머티리얼이라도 WGSL 문자열이 다름) 조기 더미 컴파일의 캐시 적중은 일부만.
- three를 올리면 compileAsync 루프 패치·`TAAUNode._originalProjectionMatrix`(비공개 필드) 재확인.
