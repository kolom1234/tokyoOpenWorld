# @sanpo/geo
Layer: L1 | Depends: core, proj4 | Used by: streaming, render, physics, sim, traversal, apps/game, tools/pipeline

## Purpose
좌표계 변환의 **유일한** 구현. GEO(EPSG:6668/6697) ↔ PRJ(EPSG:6677) ↔ WF, 셀 인덱싱, 자오선 수렴각.

## Public API (src/api.ts)
```ts
export const WORLD_ORIGIN = { E0: -12000.0, N0: -37760.0, epsg: 'EPSG:6677' } as const;
export const CELL_SIZES = [256, 1024, 4096, 16384] as const;
export interface LonLat { lon: number; lat: number }            // 도(degree)
export function lonLatToWF(ll: LonLat, heightTP?: number): Vec3d;
export function wfToLonLat(p: Vec3d): LonLat & { heightTP: number };
export function prjToWF(northing: number, easting: number, heightTP: number): Vec3d;  // EPSG:6677 축순서 주의(X=북)
export function wfToPrj(p: Vec3d): { northing: number; easting: number; heightTP: number };
export function cellOf(level: 0|1|2|3, xWF: number, zWF: number): CellKey;
export function cellOriginWF(k: CellKey): Vec3d;
export function cellBoundsWF(k: CellKey): { minX: number; minZ: number; maxX: number; maxZ: number };
export function parentOf(k: CellKey): CellKey | null;
export function childrenOf(k: CellKey): CellKey[];              // 16개
export function hlodChildIndex(child: CellKey): number;         // 0..15 = (iz mod 4)*4 + (ix mod 4), 양의 나머지
export function gridConvergenceDeg(ll: LonLat): number;         // 도북 − 진북
export function trueToGridAzimuthDeg(azTrueDeg: number, ll: LonLat): number;
```

## Invariants
- WF: +X 동, +Y 위(T.P. 표고), −Z 도북. `z = −(N − N0)`.
- 원점 상수는 `world.json`과 일치해야 하며 부팅 시 검증(불일치 = 치명 오류).
- proj4 정의 문자열은 `internal/crs-defs.ts`에 고정(외부 조회 금지).
- 음수 셀 인덱스는 `Math.floor` 기반(절삭 금지).

## Files
| 파일 | 책임 |
|---|---|
| src/internal/crs-defs.ts | EPSG 정의 문자열 |
| src/internal/transforms.ts | 좌표 변환 |
| src/internal/cells.ts | 셀 계산·부모/자식 |
| src/internal/convergence.ts | 수렴각 |
| test/golden.json | pyproj 기준점 20개 |

## Tests
골든 20점(오차 < 1 mm), 왕복 변환, 셀 경계(x = −256, −0.0001, 0), 자식 16개 합 = 부모.

## Status
미구현 (M01-T01).

## Gotchas
- EPSG:6677 공식 축순서는 (X=Northing, Y=Easting). proj4는 기본 (x=easting, y=northing)으로 다룸 → 래퍼에서 명시적으로 이름 붙인 필드만 사용.
- PLATEAU 원본은 EPSG:6697(위도, 경도, 높이 순).
