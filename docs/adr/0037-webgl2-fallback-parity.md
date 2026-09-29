# ADR-0037: WebGL2 폴백 동등성 — 하드웨어는 같은 파이프라인, 소프트웨어만 직접 렌더 (M03-T09)
- Status: Accepted
- Date: 2026-09-29

## Context
ADR-0028은 WebGL2를 직접 렌더(후처리·그림자·환경 프로브 없음)로 두었다 — 근거는 SwiftShader(CI)에서 공중원근이 1.4 FPS. 실제 GPU의 WebGL2(`?backend=webgl`)에서
확인하니 금속·유리 파사드가 검게(환경광 없음), 공중원근·AO·그림자가 없어 WebGPU와 차이가 컸다. 07 §9: WebGL2 폴백 = 최대 Medium, 미지원 기능 자동 비활성, 유리 반사 과다 보정.

## Decision
1. 백엔드 예측에 **소프트웨어 래스터 판정**(WEBGL_debug_renderer_info: SwiftShader·llvmpipe·Basic Render Driver)을 추가. 소프트웨어면 직접 렌더(ADR-0028 유지).
2. **하드웨어 WebGL2** = WebGPU와 같은 후처리 그래프 + 환경 프로브 + CSM 그림자(takram 노드가 WebGL2에서도 오류 없이 동작 확인). 품질 상한 Medium(M03-T08 관리자).
3. 미지원 기능: 자동 노출(컴퓨트) 끔 → 고정 배율 1.25(WebGPU 골든뷰 자동 노출 0.8–1.9의 기하 중간).
4. 유리 반사 과다 보정: SSR 없이 프로브만 비쳐 저고도 태양·지면이 거울 띠로 과하게 반사 → 유리 거칠기 하한 0.06 → 0.16(`glassRoughness` uniform).

## Consequences
- 하드웨어 WebGL2 골든(`docs/screenshots/M03/T09-webgl2/`): 5뷰 오류 0, Medium(GTAO) 적용, WebGPU와 톤·구도 근접.
- 남은 차이: 일부 금속·커튼월 파사드가 WebGL2에서 더 어둡다(프로브 반사 차이 — 원인 미확정, 후속). CI(SwiftShader)는 기존 직접 렌더 그대로 → e2e 불변.
