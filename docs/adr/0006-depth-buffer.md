# ADR-0006: Depth buffer strategy — reversed-Z 우선, logarithmic 폴백
- Status: Accepted (M01-T06)
- Date: 2026-09-28

## Context
근평면 0.1 m ~ 원평면 60 km(07 §1)에서 Z-파이팅 없이 렌더링해야 한다. 표준 깊이(비선형 [0,1] + 24-bit 정수)는
near/far = 6×10⁵에서 수 km 밖 정밀도가 무너진다. 후처리(GTAO·SSR·안개)는 깊이 표현에 의존하므로 초기에 고정해야 한다.

## 확인 결과 (three 0.186.1, `node_modules/three/src` 직접 확인)
- `WebGPURenderer({ reversedDepthBuffer })` 옵션이 있다(`renderers/common/Renderer.js`).
  - WebGPU 백엔드: 깊이 텍스처를 `FloatType`(depth32float)으로, 비교 함수를 역방향(`ReversedDepthFuncs`)으로, 클리어 깊이 0 — 항상 가능.
  - WebGL2 폴백: `EXT_clip_control`이 있을 때만 켜고(`WebGLBackend.init`), 없으면 경고 후 **표준 깊이**로 조용히 되돌린다.
  - 카메라 투영은 렌더 시 `camera.reversedDepth`로 자동 전환(`Renderer._renderScene`), 프러스텀 컬링도 대응.
- `logarithmicDepthBuffer`는 NodeMaterial이 프래그먼트 깊이를 기록(`viewZToLogarithmicDepth`) → early-Z 손실, 그림자 노드도 분기.
- 실측(M01-T06, 클라우드 세션 headless Chromium + SwiftShader WebGL2): `EXT_clip_control` 있음 → WebGL2에서도 reversed-Z 동작.
  world-mini 시작 화면(0.1 m ~ 60 km) Z-파이팅 없음, +4096 m 원점 재설정 왕복 전후 화면 픽셀 차 0(`tests/e2e/render.spec.ts`).

## Decision
1. **reversed-Z 우선**: 초기화 전에 백엔드를 예측(`backend-caps.ts`: WebGPU 어댑터 유무, WebGL2면 임시 컨텍스트로 `EXT_clip_control` 확인)해
   가능하면 `reversedDepthBuffer: true`, 불가능하면 `logarithmicDepthBuffer: true`로 렌더러를 만든다(두 옵션은 생성 시 고정).
2. 초기화 후 실제 상태를 `RenderService.depth`(`'reversed-z' | 'logarithmic' | 'standard'`)로 노출하고, 예측과 다르면 경고 로그.
   `'standard'`는 예측이 빗나가 three가 기본 깊이로 되돌린 경우뿐이다(정상 경로에서는 나오지 않음).
3. 근평면 0.1 m·원평면 60 km 유지. 비행 고도에 따른 근/원평면 동적 조정은 필요해지면 보조 수단으로(현재 불필요).

## Consequences
- 후처리·깊이 기반 노드(M03 GTAO/SSR/안개)는 reversed-Z(깊이 1 = 근평면)를 기본 가정으로 작성하고, logarithmic 경로는 품질 티어 테스트에서 확인.
- WebGPU·대부분의 WebGL2(ANGLE)에서 같은 깊이 표현 → 골든뷰 차이가 백엔드별 깊이 정밀도 때문에 생기지 않는다.
- `EXT_clip_control`이 없는 구형 WebGL2에서는 logarithmic(early-Z 손실 → 과대 오버드로 시 GPU 비용 증가). 해당 환경은 폴백 품질 상한 Medium(07 §9).

## Alternatives
- logarithmicDepthBuffer 단독: 백엔드 무관 동작하지만 early-Z 손실·그림자/후처리 분기 → 기각(폴백으로만).
- 근/원평면 동적 조정만: 지상 근거리(0.1 m)와 원거리 스카이라인(수 km)을 한 프레임에 동시에 다룰 수 없음 → 기각.
