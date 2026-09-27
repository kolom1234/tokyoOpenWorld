# @sanpo/render
Layer: L3 | Depends: core, geo, tile-format(타입), three@0.186.1, @takram/three-atmosphere(/webgpu), meshoptimizer | Used by: apps/game

## Purpose
WebGPU(폴백 WebGL2) 렌더링 전부: 씬 그래프·원점 재설정, 셀 메시화, 고정 머티리얼 클래스(TSL), 대기·태양·그림자·야간 광원, 후처리, 인스턴스 레이어(보행자·교통·열차), 품질 티어, 스크린샷.
상세: `docs/07-rendering.md` (API 전문 §11, 파일 구성 §12).

## Public API (요약)
`createRender(deps) → Promise<RenderService>`:
`renderOriginWF, addCell, removeCell, setHlodChildVisible, setCamera, setEnvironment, setQuality, layers{pedestrians,traffic,trains,player}, precompile, screenshot, stats` (+ `SystemProvider`: phase 70/80).

## Invariants
- 머티리얼 클래스는 07 §4 고정 목록. 새 클래스 추가 = 문서 갱신 + precompile 목록 추가.
- 씬 노드 위치 = (WF − renderOrigin)을 float64로 계산 후 대입. 누적 이동 금지.
- 셀 텍스처 없음: 모든 텍스처는 shared 머티리얼 배열.
- 메인 스레드 GPU 업로드는 streaming 예산(2 ms) 안에서만.
- 태양·달 방향은 계산하지 않는다(sim의 `EnvironmentState` 소비).
- 실존 상표·로고 텍스처 금지(M_SIGN은 가상 브랜드 아틀라스만).

## Files
renderer/(init, backend-caps, dynamic-resolution), scene/(scene-graph, cell-node, origin, culling, hlod-switch), materials/(registry, terrain, road, decal, facade/*, glass, foliage, character-vat, vehicle, water, sign), lighting/(sun, atmosphere, env-probe, clustered, night-lights), post/(pipeline, exposure, lut, photo), weather/(rain-compute, wetness, clouds-*), instances/(pools, lod, impostor), debug/overlay.

## Tests
- 순수 로직(단위): 원점 재설정 계산, LOD 선택, 파사드 파라미터 디코드, 창 점등 확률 함수.
- 시각: 골든뷰(14 §3). 성능: `pnpm perf`.

## Status
미구현 (M01-T06 최소 → M03 본격).

## Gotchas
- three r186 명칭: 후처리는 `RenderPipeline`(구 PostProcessing), `PCFSoftShadowMap` 제거됨. addon 이름은 `node_modules/three/examples/jsm/{tsl/display,lighting,lights}`에서 확인.
- takram atmosphere의 WebGPU 노드명은 `@takram/three-atmosphere/webgpu` 타입 정의 확인 후 사용.
