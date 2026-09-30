# ADR-0040: WebGL2 파사드 어두움 = GTAO 위치 복원 오류 → three `getViewPosition` 역-Z 패치, 원점 재설정 e2e 안정화 (M03 보강 4)
- Status: Accepted
- Date: 2026-09-30

## Context
1. ADR-0037(M03-T09) 남은 차이: 하드웨어 WebGL2(`?backend=webgl`)에서 금속·커튼월 파사드가 WebGPU보다 어둡다(원인 미확정).
2. 로컬에서 부하가 있을 때 e2e 1건이 가끔 실패(스펙 미확인, M03-T07·T08 중 2회).

## 조사(실측, RTX 3050 Laptop, 서신주쿠 초고층 골든뷰, 둘 다 Medium·고정 노출 1.25 — WebGPU `?post=autoExposure:0,exp:1.25`)
파사드 띠(y 150–560) 평균 휘도 WebGPU / WebGL2:
| 조건 | WebGPU | WebGL2 |
|---|---|---|
| 기본 | 56.4 | 36.0 (흰 건물 44.7 → 9.5) |
| 환경 프로브 끔 | 43.6 | 29.5 |
| 그림자 끔 | 65.7 | 43.5 |
| 단색 파사드(`?facade=flat`) | 73.3 | 47.2 |
| 법선 시각화 | 같음 | 같음 |
| **AO 끔(`ao:none`)** | **78.6** | **78.6** |
환경 프로브 큐브맵 6면도 두 백엔드가 같았다(±X만 GL 규약대로 교환). 하늘·도로는 같고 건물 면만 방향에 따라 어두움 → GTAO.

원인: three r186 `getViewPosition`(GTAO·TAAU 히스토리 검증·SSR·Denoise가 사용)은 WebGL 좌표계면 깊이를 NDC [−1, 1]로 보고 `depth × 2 − 1`로 바꾼다.
그러나 역-Z(`reversedDepthBuffer`, WebGL2는 EXT_clip_control 0..1)의 투영행렬은 좌표계와 관계없이 NDC z ∈ [0, 1] → 복원 위치가 틀려 거짓 차폐가 면 방향에 따라 생긴다.

flaky e2e: `render.spec.ts` 원점 재설정(+4096 m 왕복). 4 병렬 × 8회 부하에서 8/8 실패 재현.
(a) `rebaseTest`가 멀리 **1 s(시간)** 만 머묾 — 1 FPS 미만이면 그 위치 프레임이 안 그려져 재설정 없음(`data-rebases` 0),
(b) 돌아온 직후 해제됐던 셀 재적재·HLOD 페이드 도중 캡처 → 25만 px 차이.

## Decision
1. **three 패치**(`patches/three@0.186.1.patch`, pnpm patchedDependencies): `getViewPosition`에 `renderer.reversedDepthBuffer`면 깊이를 그대로 NDC z로 쓰는 분기
   (`build/three.webgpu.js`·`build/three.webgpu.nodes.js`·`src/nodes/utils/PostProcessingUtils.js`). WebGPU 경로는 원래도 그 식이라 불변.
   `pnpm patch-commit`은 한글 절대 경로를 헤더에 넣어 적용 실패 → 원본 tarball과 `git diff --no-index`로 상대 경로 패치를 만들었다.
2. e2e 안정화: `rebaseTest`는 재설정 횟수(프레임)를 기다리고(최대 30 s) 최소 1 s 머묾. 오버레이 `data-settled`(HLOD 페이드 0 + 스트리밍 대기 0),
   테스트는 캡처 전 `data-settled`·셀 수 복귀를 기다린다. 원점 재설정 테스트는 640×360·180 s 제한(부하 러너), 허용 z-파이팅은 절대 184 px(경계선 길이에 비례).
3. 디버그: `?post=exp:<n>`(고정 노출 배율 — 자동 노출 끈 WebGPU를 WebGL2와 같은 노출로 비교).

## Consequences
- WebGL2 파사드 = WebGPU(서신주쿠 파사드 띠 36.0 → 56.2, WebGPU 56.4). 하드웨어 WebGL2의 TAAU 히스토리 검증도 올바른 깊이로.
- 원점 재설정 e2e: 4 병렬 × 8 = 8/8 통과(수정 전 8/8 실패).
- three 버전을 올리면 patches/three@*.patch 재확인(업스트림 수정 여부).
