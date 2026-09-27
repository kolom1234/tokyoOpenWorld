# @sanpo/render
Layer: L3 | Depends: core, geo, tile-format(타입), three@0.186.1, @takram/three-atmosphere(/webgpu, M03), meshoptimizer | Used by: apps/game

## Purpose
WebGPU(폴백 WebGL2) 렌더링 전부: 씬 그래프·원점 재설정, 셀 메시화, 고정 머티리얼 클래스(TSL), 대기·태양·그림자·야간 광원, 후처리, 인스턴스 레이어(보행자·교통·열차), 품질 티어, 스크린샷.
상세: `docs/07-rendering.md` (API 전문 §11, 파일 구성 §12).

## Public API (M01-T06 구현분 — 07 §11의 부분집합)
```ts
createRender(deps: { canvas: HTMLCanvasElement; bus: EventBus; log: Logger; config?: DeepPartial<RenderConfig> }): Promise<RenderService>
RenderConfig { backend: 'auto' | 'webgl'; farM (60 km); maxPixelRatio (2); rebaseDistanceM (2048); rebaseGridM (256) }
RenderService extends SystemProvider {            // systems: renderPrep(70), render(80)
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly backend: 'webgpu' | 'webgl2';           // 초기화 후 실제 백엔드
  readonly depth: 'reversed-z' | 'logarithmic' | 'standard';   // ADR-0006
  addCell(p: CellPayload): void;                   // 소유권 이전(배열 그대로 GPU 버퍼), 같은 키면 교체
  removeCell(key: CellKey): void;
  setCamera(c: CameraState): void;                 // WF float64 — 다음 renderPrep에서 반영
  stats(): RenderStats;                            // backend, depth, frames, drawCalls, triangles, cells, originRebases, renderOriginWF
  dispose(): void;
}
```
미구현(M03~): `setHlodChildVisible`, `setEnvironment`, `setQuality`, `layers`, `precompile`, `screenshot`, `deps.assets`.

## Invariants
- 머티리얼 클래스는 07 §4 고정 목록. 새 클래스 추가 = 문서 갱신 + precompile 목록 추가. (M01: `terrain_ground`·`facade_default` 단색 PBR, 모르는 ID는 마젠타)
- 씬 노드 위치 = (WF − renderOrigin)을 float64로 계산 후 대입. 누적 이동 금지. 재설정·카메라 대입은 같은 renderPrep 안(한 프레임 튐 없음).
- 원점 재설정: 카메라가 renderOrigin에서 ≥ 2048 m(3D) → x·z를 256 m 격자에 스냅(y = 0), `origin/rebased` 발행.
- `DecodedMesh` 속성 이름은 glTF 의미 이름 → render가 three 이름으로 변환(ADR-0020). 경계는 `boundsLocal` 사용(정점 순회 없음).
- 셀 텍스처 없음: 모든 텍스처는 shared 머티리얼 배열.
- 메인 스레드 GPU 업로드는 streaming 예산(2 ms) 안에서만.
- 태양·달 방향은 계산하지 않는다(sim의 `EnvironmentState` 소비). M01은 고정 방향(방위 200°·고도 50°) 방향광 1개 + 반구광.
- 실존 상표·로고 텍스처 금지(M_SIGN은 가상 브랜드 아틀라스만).

## Files
renderer/(init — WebGPURenderer·깊이 전략, backend-caps — WebGPU 어댑터·EXT_clip_control 예측), scene/(scene-graph, cell-node — DecodedMesh→Mesh·CellSet, origin — 재설정 순수 계산, render-view — WF 카메라·재설정 실행), materials/registry, lighting/sun, config.ts, service.ts.
예정: renderer/dynamic-resolution, scene/(culling, hlod-switch), materials/(terrain, road, decal, facade/*, glass, …), lighting/(atmosphere, env-probe, clustered, night-lights), post/*, weather/*, instances/*, debug/overlay.

## Tests
- 단위(test/): 원점 재설정 판정·스냅·왕복 비트 일치·float32 정밀도, 깊이 모드 판정, 태양 방향, DecodedMesh→BufferGeometry(이름 변환·무복사·경계).
- E2E(tests/e2e/render.spec.ts, WebGL2/SwiftShader): 시작 화면 건물 픽셀 비율, 원점 재설정 왕복 전후 픽셀 차 0.
- 시각: 골든뷰(14 §3, M03). 성능: `pnpm perf`.

## Status
M01-T06 최소 구현(초기화·reversed-Z·방향광·셀 메시·원점 재설정) → M03 본격(머티리얼·대기·후처리).

## Gotchas
- three r186 명칭: 후처리는 `RenderPipeline`(구 PostProcessing), `PCFSoftShadowMap` 제거됨. addon 이름은 `node_modules/three/examples/jsm/{tsl/display,lighting,lights}`에서 확인.
- `reversedDepthBuffer`·`logarithmicDepthBuffer`는 생성자 옵션(이후 readonly). WebGL2는 `EXT_clip_control` 없으면 three가 조용히 표준 깊이로 폴백 → `backend-caps.ts`로 미리 판정.
- WebGPU는 `snorm8x3`·`unorm16x3` 정점 형식이 없다 → three가 업로드 시 4성분으로 패딩(WebGPUAttributeUtils). 밀집 3성분 배열을 그대로 넘겨도 된다.
- takram atmosphere의 WebGPU 노드명은 `@takram/three-atmosphere/webgpu` 타입 정의 확인 후 사용.
