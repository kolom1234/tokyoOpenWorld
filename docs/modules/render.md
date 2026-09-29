# @sanpo/render
Layer: L3 | Depends: core, geo, tile-format(타입), three@0.186.1, @takram/three-atmosphere@0.19.1 + three-geospatial@0.9.1(/webgpu, r186 패치 — ADR-0028), meshoptimizer | Used by: apps/game

## Purpose
WebGPU(폴백 WebGL2) 렌더링 전부: 씬 그래프·원점 재설정, 셀 메시화, 고정 머티리얼 클래스(TSL), 대기·태양·그림자·야간 광원, 후처리, 인스턴스 레이어(보행자·교통·열차), 품질 티어, 스크린샷.
상세: `docs/07-rendering.md` (API 전문 §11, 파일 구성 §12).

## Public API (M01-T06 구현분 — 07 §11의 부분집합)
```ts
createRender(deps: { canvas: HTMLCanvasElement; bus: EventBus; log: Logger; config?: DeepPartial<RenderConfig> }): Promise<RenderService>
RenderConfig { backend: 'auto' | 'webgl'; farM (60 km); maxPixelRatio (2); rebaseDistanceM (2048); rebaseGridM (256); basisPath ('/basis/'); exposure (3); gpuTiming (false) }
RenderService extends SystemProvider {            // systems: renderPrep(70), render(80)
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly backend: 'webgpu' | 'webgl2';           // 초기화 후 실제 백엔드
  readonly depth: 'reversed-z' | 'logarithmic' | 'standard';   // ADR-0006
  addCell(p: CellPayload): void;                   // 소유권 이전(배열 그대로 GPU 버퍼), 같은 키면 교체. hlod.mesh → 셀당 draw 2(`_CHILD` → f32 `_child`)
  removeCell(key: CellKey): void;
  setHlodChildVisible(parent: CellKey, child: number /*0..15*/, visible: boolean): void;  // false = 0.3 s 디더 페이드, true = 즉시(M02-T05)
  loadMaterials(manifestUrl): Promise<MaterialLibraryStats>;  // M03-T01: manifest → 평균색 → KTX2 배열 3장 교체(재컴파일 없음), 첫 표시 뒤 호출
  precompile(): Promise<void>;                     // 대기 LUT 계산(await) + 고정 머티리얼 × {기본, HLOD} compileAsync
  setCamera(c: CameraState): void;                 // WF float64 — 다음 renderPrep에서 반영
  setEnvironment(e: EnvironmentState): void;       // M03-T02: sunDirWF·moonDirWF → 대기(ECEF). 천문 계산은 sim
  stats(): RenderStats;                            // backend, depth, frames, drawCalls, triangles, cells, originRebases, renderOriginWF, hlodParents, hlodFading, materials{state,layers,downloadBytes,gpuBytes,loadMs}, gpu{enabled,frameMs,samples}
  dispose(): void;
}
```
미구현(M03~): `setQuality`, `layers`, `screenshot`, `deps.assets`(머티리얼은 `loadMaterials(url)`로 대체).

## Invariants
- 머티리얼 클래스는 07 §4 고정 목록. 새 클래스 추가 = 문서 갱신 + precompile 목록 추가. (M01: `terrain_ground`·`facade_default` 단색 PBR, 모르는 ID는 마젠타)
- 씬 노드 위치 = (WF − renderOrigin)을 float64로 계산 후 대입. 누적 이동 금지. 재설정·카메라 대입은 같은 renderPrep 안(한 프레임 튐 없음).
- 원점 재설정: 카메라가 renderOrigin에서 ≥ 2048 m(3D) → x·z를 256 m 격자에 스냅(y = 0), `origin/rebased` 발행.
- `DecodedMesh` 속성 이름은 glTF 의미 이름 → render가 three 이름으로 변환(ADR-0020). 경계는 `boundsLocal` 사용(정점 순회 없음).
- 셀 텍스처 없음: 모든 텍스처는 shared 머티리얼 배열(ADR-0027). 그룹 이름 `MATERIAL_GROUPS`는 파이프라인 library.json group과 1:1(추가는 끝에만).
- 셰이더 해시 입력은 작은 정수만 varying으로(`_bldg` → 반올림 → uint 결합). 큰 float varying 보간 = 픽셀 노이즈(ADR-0027 §5).
- 텍스처 교체 대상(자리표시)은 최종 텍스처와 같은 샘플러 필터를 가진다(밉맵 선형·이방성 8).
- 메인 스레드 GPU 업로드는 streaming 적용 예산(2 ms + 4 MiB/프레임, apps/game 배선) 안에서만.
- HLOD 머티리얼은 머티리얼 ID당 1개(셀별 페이드는 per-object uniform `userData.hlodFade` Vector4 × 4) → 셀이 늘어도 파이프라인 불변. 페이드 0 = 정점 붕괴(ADR-0025).
- 자식 표시 상태는 부모 도착 전에도 보관(도착 순서 무관), 보임은 항상 즉시(자식 제거 전 → 구멍 없음).
- 태양·달 방향은 계산하지 않는다(sim의 `EnvironmentState` 소비). 연결 전 기본 = 방위 200°·고도 50°. 광원 = takram `AtmosphereLight` 1개(+ 환경 PMREM), 하늘 = `skyBackground`.
- WF → ECEF(`lighting/atmosphere.ts worldToEcef`)는 원점 재설정마다 다시 계산. 레이마칭 산란은 TAA 전까지 끔(결정론).
- WebGPU = 후처리 파이프라인(`pass().setMRT(mrt({output}))` → aerialPerspective), WebGL2 = 직접 렌더(T08/T09 전 임시, ADR-0028).
- 실존 상표·로고 텍스처 금지(M_SIGN은 가상 브랜드 아틀라스만).

## Files
context(초기화·씬·머티리얼·대기·후처리 묶음), frame(renderPrep 70·render 80), renderer/(init — WebGPURenderer·깊이 전략·trackTimestamp, backend-caps — WebGPU 어댑터·EXT_clip_control 예측, gpu-timer — timestamp 평균), lighting/(atmosphere — Context·Light·하늘·WF→ECEF·LUT prepare, env-probe — SkyEnvironmentNode, sun — 방향 규약·기본값), post/(pipeline — 씬 패스 MRT → aerialPerspective / 직접 렌더), scene/(scene-graph, cell-node — DecodedMesh→Mesh·CellSet·`_CHILD` 변환, origin — 재설정 순수 계산, render-view — WF 카메라·재설정 실행, hlod-switch — 자식 표시·페이드 상태), materials/(registry — 기본·HLOD, library — KTX2 배열·manifest·평균색·그룹 uniform, textured — 지형(`_SURF` 그룹·월드 XZ)·파사드(건물 해시 벽 그룹, UV0 벽 미터)·sampleLayer·perturbWorld·buildingHashes, hlod — TSL 자식 페이드·붕괴, precompile — 셀과 같은 속성 형식 더미), lighting/sun, config.ts, service.ts.
컬링은 three 메시별 프러스텀 컬링(boundsLocal 구) — 별도 culling.ts 없음(필요 시 perf 후).
예정: renderer/dynamic-resolution, scene/(culling, hlod-switch), materials/(terrain, road, decal, facade/*, glass, …), lighting/(atmosphere, env-probe, clustered, night-lights), post/*, weather/*, instances/*, debug/overlay.

## Tests
- 단위(test/): 원점 재설정 판정·스냅·왕복 비트 일치·float32 정밀도, 깊이 모드 판정, 태양 방향, DecodedMesh→BufferGeometry(이름 변환·무복사·경계), HLOD 전환(hlod.test: 페이드·즉시 보임·늦은 부모·정리, `_CHILD` f32), materials.test(라이브러리 실패 경로·레지스트리·셀 시드).
- E2E(tests/e2e/render.spec.ts, WebGL2/SwiftShader): 시작 화면 건물 픽셀 비율, 원점 재설정 왕복 전후 픽셀 차 0.
- 시각: 골든뷰(`pnpm golden`, 14 §3, tests/golden/README.md). 성능: `pnpm perf`.

## Status
M01-T06 최소 구현(초기화·reversed-Z·방향광·셀 메시·원점 재설정) + M02-T05 HLOD 자식 전환·선컴파일(ADR-0025) → M03 본격(머티리얼·대기·후처리).

## Gotchas
- takram 0.19.1 × three r186: 패치 필수(struct Proxy, requestIdleCallback 타임아웃). LUT가 0이면 조명·하늘이 **검게** 나온다 — `precompile()`의 LUT prepare 확인.
- 게임 번들은 `three` → `apps/game/src/three-compat.ts` alias(WebGLCubeRenderTarget·WebGLRenderer 대체). render 패키지 테스트(Node)는 실제 `three`를 쓴다.
- three r186 명칭: 후처리는 `RenderPipeline`(구 PostProcessing), `PCFSoftShadowMap` 제거됨. addon 이름은 `node_modules/three/examples/jsm/{tsl/display,lighting,lights}`에서 확인.
- `reversedDepthBuffer`·`logarithmicDepthBuffer`는 생성자 옵션(이후 readonly). WebGL2는 `EXT_clip_control` 없으면 three가 조용히 표준 깊이로 폴백 → `backend-caps.ts`로 미리 판정.
- WebGPU는 `snorm8x3`·`unorm16x3` 정점 형식이 없다 → three가 업로드 시 4성분으로 패딩(WebGPUAttributeUtils). 밀집 3성분 배열을 그대로 넘겨도 된다.
- takram atmosphere의 WebGPU 노드명은 `@takram/three-atmosphere/webgpu` 타입 정의 확인 후 사용.
