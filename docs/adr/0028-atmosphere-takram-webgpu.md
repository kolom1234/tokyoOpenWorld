# ADR-0028: 대기·하늘·환경 조명 — takram three-atmosphere WebGPU 통합 (M03-T02)
- Status: Accepted
- Date: 2026-09-29

## Context
07 §6은 `@takram/three-atmosphere/webgpu`(0.19.1)로 하늘·태양/하늘 조도·공중원근을, 하늘 큐브맵 → PMREM(6프레임 분할)으로 환경 조명을 정했다.
three는 0.186.1로 고정(02). takram 0.19.1(2026-05, 최신)은 three r186과 두 군데서 어긋나고, 게임은 WebGPU 빌드만 번들한다.

## Decision
0. (ADR-0029 §5 개정) WebGPU 경로에서는 하늘 배경 노드를 쓰지 않는다(환경 프로브와 겹치면 배경 머티리얼 매 프레임 재빌드).
1. **좌표**: `AtmosphereContext.matrixWorldToECEF` = 렌더 원점(WF)의 타원체 위치(TP + 지오이드고 36.7 m, MVP 구역 상수) × 로컬 North-Up-East ×
   WF 축 변환(도북 −Z를 진북 기준 방위 γ로 회전 — `gridConvergenceDeg`). 원점 재설정 때 다시 계산. 태양·달은 **WF 방향을 받아** 같은 행렬로 ECEF로 보낸다
   (render는 천문 계산을 하지 않는다 — `setEnvironment(EnvironmentState)`, sim은 T03).
2. **조명**: `AtmosphereLight`(직사 + 하늘 간접) + `renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)`, 하늘 = `scene.backgroundNode = skyBackground()`.
   환경 = `SkyEnvironmentNode`(64² 큐브 → PMREM)를 `scene.environmentNode`로 — 이때 라이트의 간접(indirect)은 끈다(이중 계산). 갱신은 라이브러리 임계값
   (카메라 1 km·태양 각도) — 07 §6의 "6프레임 분할"은 쓰지 않는다(하늘만 담은 64² 큐브라 1회 비용이 작다).
3. **후처리(최소)**: `pass(scene, camera).setMRT(mrt({ output }))` → `aerialPerspective(color, depth)` → `RenderPipeline`(AgX). 노출은 자동 노출(T07) 전 고정 **3**
   (`?exposure=`로 조정). 레이마칭 산란(`raymarchScattering`)은 STBN 시간 노이즈 때문에 TAA(T07) 전까지 끈다(원점 재설정 픽셀 동일 e2e·골든 SSIM).
4. **WebGL2 폴백은 후처리 없이 직접 렌더**(하늘 배경 + 대기 라이트): SwiftShader에서 공중원근을 픽셀마다 CPU로 계산하면 ≈ 1.4 FPS. 품질 티어(T08/T09)가 대체.
5. **three r186 호환 패치**(`patches/@takram__*.patch`, `pnpm-workspace.yaml patchedDependencies`):
   - r186 `struct()`가 Proxy를 반환해 `X.layout.name`이 undefined → `.name`(atmosphere), `Je()` 레이아웃 판별(geospatial).
   - LUT 계산이 `requestIdleCallback`(타임아웃 없음)으로 분할되는데 렌더 루프가 프레임을 채우면 idle이 오지 않아 **LUT가 영영 0 → 조명·하늘이 검다** → `timeout: 50`.
   - 추가로 `precompile()`에서 1회 직접 렌더(LUT 노드 setup) 후 `lutNode.updateTextures()`를 await(첫 표시부터 하늘이 있게).
6. **번들**: `three` → `apps/game/src/three-compat.ts`(= `three/webgpu` + `WebGLCubeRenderTarget` → WebGPU `CubeRenderTarget`, `WebGLRenderer` = instanceof용 빈 클래스).
   KTX2Loader·takram의 `three` import가 WebGL 렌더러를 끌어오지 않는다.
7. **three r186 주의**: MRT 없이 `pass().getTextureNode('output')`을 쓰는 예제 패턴은 (위 LUT 문제와 겹쳐) 원인 분리가 어려웠다 — 항상 `setMRT(mrt({ output, … }))`.
8. **GPU 타이머**: `RenderConfig.gpuTiming`(`?gpuTiming=1`) → three `trackTimestamp` + `resolveTimestampsAsync('render')` → `stats().gpu.frameMs`(렌더 패스 합, 컴퓨트 제외).
   Chrome은 `--enable-webgpu-developer-features`여야 100 µs 양자화가 풀린다(골든 설정에 포함). → 합산 방식 정정: ADR-0029 §6.

## Consequences
- 실측(RTX 3050 Laptop, 2560×1440, core 4뷰): GPU 프레임 ≈ 17–25 ms(대기·환경·공중원근 포함, 그림자 전). 처음 적은 4.5–6.4 ms는 GPU 타이머 버그(ADR-0029 §6)로 틀린 값.
- takram이 r186을 지원하면 패치 제거(패치 파일 = 3 hunk). takram 업그레이드 시 `pnpm install`이 패치 적용 실패로 알려 준다.
- 황혼·밤은 고정 노출에서 매우 어둡다 → 자동 노출(T07)·야간 광원(M09)에서 해결.

## Addendum (2026-09-29, M03-T09 — ADR-0037)
WebGL2 직접 렌더는 **소프트웨어 래스터(SwiftShader 등)일 때만** 유지한다. 하드웨어 WebGL2는 WebGPU와 같은 후처리(공중원근 포함)·환경 프로브·그림자를 쓴다.
