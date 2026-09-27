# @sanpo/geo
Layer: L1 | Depends: core, proj4 2.22.0 | Used by: streaming, render, physics, sim, traversal, apps/game, tools/pipeline

## Purpose
좌표계 변환의 **유일한** 구현. GEO(EPSG:6668/6697) ↔ PRJ(EPSG:6677) ↔ WF, 셀 인덱싱, 자오선 수렴각.

## Public API (src/api.ts 타입·상수 + index.ts 재수출 함수)
```ts
// api.ts
export const WORLD_ORIGIN = { E0: -12000.0, N0: -37760.0, epsg: 'EPSG:6677' } as const;
export const CELL_SIZES = [256, 1024, 4096, 16384] as const;
export const CELL_FANOUT = 4;
export interface LonLat { lon: number; lat: number }            // 도(degree), EPSG:6668
export interface PrjCoord { northing: number; easting: number; heightTP: number } // EPSG:6677 m
export interface CellBoundsWF { minX: number; minZ: number; maxX: number; maxZ: number } // min 포함, max 제외
export interface LonLatBBox { west: number; south: number; east: number; north: number }
export type { CellLevel } from '@sanpo/core';
// 변환 (internal/transforms.ts) — 비유한 입력은 RangeError
export function lonLatToWF(ll: LonLat, heightTP?: number): Vec3d;
export function wfToLonLat(p: Vec3d): LonLat & { heightTP: number };
export function lonLatToPrj(ll: LonLat, heightTP?: number): PrjCoord;
export function prjToLonLat(prj: PrjCoord): LonLat & { heightTP: number };
export function prjToWF(northing: number, easting: number, heightTP: number): Vec3d;  // 인자 순서 = 공식 축순서(X=북)
export function wfToPrj(p: Vec3d): PrjCoord;
// 셀 (internal/cells.ts)
export function cellOf(level: CellLevel, xWF: number, zWF: number): CellKey;
export function cellOriginWF(k: CellKey): Vec3d;                // −X·−Z(서·북) 모서리, y=0
export function cellBoundsWF(k: CellKey): CellBoundsWF;
export function parentOf(k: CellKey): CellKey | null;           // L3 → null
export function childrenOf(k: CellKey): CellKey[];              // 16개(L0 → []), 배열 인덱스 = hlodChildIndex
export function hlodChildIndex(child: CellKey): number;         // 0..15 = (iz mod 4)*4 + (ix mod 4), 양의 나머지
// 수렴각 (internal/convergence.ts)
export function gridConvergenceDeg(ll: LonLat): number;         // γ = 도북 − 진북(진북에서 시계방향 +)
export function trueToGridAzimuthDeg(azTrueDeg: number, ll: LonLat): number; // az − γ, [0, 360)
// 경계 (internal/bbox.ts)
export function lonLatBBoxOfWF(b: CellBoundsWF): LonLatBBox;    // WF 사각형 외접 위경도 상자(+1 cm), 원천 조회용
// JIS X 0410 메시 (internal/jis-mesh.ts) — PLATEAU 원천 파일 선택용
export function jisMesh3Of(lat: number, lon: number): string;  // 3차 메시(≈1 km) 8자리, 경계 위 점은 북·동 메시
export function jisMesh3CodesInBBox(b: LonLatBBox): string[];  // 상자와 겹치는 3차 메시(남→북, 서→동)
```

## Invariants
- WF: +X 동, +Y 위(T.P. 표고), −Z 도북. `x = E − E0`, `z = −(N − N0)`.
- 원점 상수는 `world.json`과 일치해야 하며 부팅 시 검증(불일치 = 치명 오류). (`world.json` 생성·검증은 M01-T05)
- proj4 정의 문자열은 `internal/crs-defs.ts`에 고정(외부 조회 금지, 비공개). pyproj(PROJ 9.5) `to_proj4()`와 동일 파라미터.
- 음수 셀 인덱스는 `Math.floor` 기반(절삭 금지). `-0`은 `0`으로 정규화.
- 정확도: pyproj 골든 20점 대비 순·역변환 최대 오차 ≈ 3 nm(허용 < 1 mm), 수렴각 ≈ 1e-9°(허용 1e-6°).

## Files
| 파일 | 책임 |
|---|---|
| src/api.ts | 공개 타입·상수 |
| src/internal/crs-defs.ts | EPSG:6668/6697/6677 정의 문자열 |
| src/internal/transforms.ts | GEO ↔ PRJ ↔ WF 변환(proj4 변환기 모듈 로드 시 1회 생성) |
| src/internal/cells.ts | 셀 계산·부모/자식·HLOD 자식 인덱스 |
| src/internal/convergence.ts | 수렴각(투영 수치 미분)·방위 보정 |
| src/internal/bbox.ts | WF 사각형 → 위경도 외접 상자 |
| src/internal/jis-mesh.ts | JIS X 0410 3차 메시 코드(M01-T02) |
| test/golden.json | pyproj 기준점 20개 (생성: `tools/pipeline/scripts/golden-geo.py`) |

## Tests
`golden.test.ts`: 골든 20점 순/역/아핀/수렴각, 스크램블 WF ≈ (−22.3, ·, 8.6), 23구 범위 왕복 < 1 µm.
`cells.test.ts`: 셀 경계(x = −256, −0.0001, 0), 자식 16개 합 = 부모, HLOD 인덱스 순서.
`convergence-bbox.test.ts`: 수렴각 부호, 방위 보정, bbox 포함.
`jis-mesh.test.ts`: 스크램블 = 53393596, 도쿄역 = 53394611, 경계 소속, 3×3 셀 → 4개 메시.

## Status
구현 완료 (M01-T01, 2026-09-27).

## Gotchas
- EPSG:6677 공식 축순서는 (X=Northing, Y=Easting). proj4는 (x=easting, y=northing) → 래퍼는 이름 있는 필드만 노출.
- PLATEAU 원본은 EPSG:6697(위도, 경도, 높이 순). 수평은 6668과 같고 높이(T.P.)는 그대로 y로 통과.
- proj4js `tmerc`는 etmerc(Poder/Engsager) 구현 → PROJ와 같은 알고리즘. `+approx`를 넣지 말 것.
- 수렴각은 MVP 구역(IX계 중앙자오선 139°50′E 서쪽)에서 **음수**(≈ −0.08°). 문서의 "≈ 0.08°"는 크기.
- 골든 재생성: `pip install pyproj==3.7.2 && python3 tools/pipeline/scripts/golden-geo.py [--check]`. golden.json은 생성물이라 Biome 제외(지수 표기 재포맷 방지).
