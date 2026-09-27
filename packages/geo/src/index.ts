// @sanpo/geo 공개 엔트리(L1): 좌표 변환(EPSG ↔ WF)·셀 인덱싱. api.ts 재수출 + 구현 함수. see docs/modules/geo.md
export * from './api.ts';
export { lonLatBBoxOfWF } from './internal/bbox.ts';
export {
  cellBoundsWF,
  cellOf,
  cellOriginWF,
  childrenOf,
  hlodChildIndex,
  parentOf,
} from './internal/cells.ts';
export { gridConvergenceDeg, trueToGridAzimuthDeg } from './internal/convergence.ts';
export {
  lonLatToPrj,
  lonLatToWF,
  prjToLonLat,
  prjToWF,
  wfToLonLat,
  wfToPrj,
} from './internal/transforms.ts';
