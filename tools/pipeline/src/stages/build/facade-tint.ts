// 실측 벽 색 → tintIdx(M12-T06, S1 — ADR-0111): 렌더가 tintIdx로 고르는 (벽 그룹 → 레이어 평균 알베도) × 팔레트를 그대로 예측해
// 측정 색(전체 노출 보정 뒤)과 CIELAB 거리가 가장 작은 tintIdx(0..255)를 고른다. 셀 형식·셰이더 변경 없음 — L0·HLOD가 같은 tint라 전환에서도 같은 색.
// 커튼월은 측정 유리 비율로(오피스). 측정 없는 건물 = 해시 tint(예전 그대로). 등록은 build·hlod 명령 시작 때 한 번(모듈 상태).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FACADE_PALETTE, facadeLayerIndex, facadeWallGroup, hash32, type Logger, WORLD_SEED } from '@sanpo/core';
import { srgbToLinear } from '../derive/facade-measure.ts';

/** 재질 매니페스트(materials 단계)에서 필요한 것: 레이어 평균색(sRGB 0..1)·그룹 → 레이어 번호들. */
export interface MaterialsAvg {
  avg: Map<number, [number, number, number]>;
  groups: Record<string, number[]>;
}

/** walls.ts wallFloor·hlod-facade 빗물 얼룩 평균(렌더와 같은 상수). */
const WALL_FLOOR = 0.08;
const DIRT_MEAN = 0.098;
/** 밝기 차는 조명·그림자 영향이 커서 가중을 낮춘다(색상·채도 위주로 고른다). */
const L_WEIGHT = 0.5;
/** 커튼월 판정(측정 유리 비율): 오피스 ≥ 0.45, 90 m 이상 오피스 ≥ 0.3. */
const GLASS_CURTAIN = 0.45;
const GLASS_CURTAIN_TOWER = 0.3;
export const TOWER_GLASS_M = 90;

/** 렌더 예측 벽 알베도(선형): wallFloor(레이어 평균 × 팔레트) × (1 − 얼룩 평균). */
export function predictWall(cls: number, tint: number, m: MaterialsAvg): [number, number, number] {
  const idx = m.groups[facadeWallGroup(cls, tint)] ?? [];
  const layer = facadeLayerIndex([idx[0] ?? 0, Math.max(1, idx.length)], tint);
  const avg = m.avg.get(layer) ?? [0.6, 0.6, 0.6];
  const pal = FACADE_PALETTE[tint % 8] as readonly [number, number, number];
  return [0, 1, 2].map((k) => {
    const a = srgbToLinear(avg[k] as number) * (pal[k] as number);
    return (WALL_FLOOR + (1 - WALL_FLOOR) * a) * (1 - DIRT_MEAN);
  }) as [number, number, number];
}

/** 선형 sRGB → CIELAB(D65). */
export function toLab([r, g, b]: readonly number[]): [number, number, number] {
  const x = (0.4124 * (r as number) + 0.3576 * (g as number) + 0.1805 * (b as number)) / 0.95047;
  const y = 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
  const z = (0.0193 * (r as number) + 0.1192 * (g as number) + 0.9505 * (b as number)) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** 최근접과 이만큼(ΔE) 이내인 후보는 구분이 어렵다 → 그중 건물 해시로 고른다(재질 다양성 유지). */
const NEAR_DE = 3;

/** 측정 색에 가장 가까운 tint. seed가 있으면 최근접 + ΔE 3 이내 후보 중 seed로(결정론). */
export function chooseTint(cls: number, wallLin: readonly number[], m: MaterialsAvg, seed?: number): number {
  const target = toLab(wallLin);
  const ds = Array.from({ length: 256 }, (_, t) => {
    const p = toLab(predictWall(cls, t, m));
    return Math.sqrt(L_WEIGHT * (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2);
  });
  let best = 0;
  for (let t = 1; t < 256; t++) if ((ds[t] as number) < (ds[best] as number)) best = t;
  if (seed === undefined) return best;
  const near = ds.flatMap((d, t) => (d <= (ds[best] as number) + NEAR_DE ? [t] : []));
  return near[(seed >>> 0) % near.length] as number;
}

export function curtainFromGlass(isOffice: boolean, heightM: number, glass: number): boolean {
  return isOffice && (glass >= GLASS_CURTAIN || (heightM >= TOWER_GLASS_M && glass >= GLASS_CURTAIN_TOWER));
}

interface Registry {
  measures: Map<string, { wall: [number, number, number]; glass: number }>;
  mats: MaterialsAvg;
  /** 측정 밝기 → 예측 밝기 전체 배율(중앙값 비). */
  gain: number;
  memo: Map<string, number>;
}
let reg: Registry | null = null;

/** facadeParams가 묻는다: 측정이 있으면 (tint, glass), 없으면 undefined. */
export function measuredFacade(id: string, cls: number): { tint: number; glass: number } | undefined {
  const m = reg?.measures.get(id);
  if (!reg || !m) return undefined;
  const key = `${id}|${cls}`;
  let tint = reg.memo.get(key);
  if (tint === undefined) {
    const seed = hash32(WORLD_SEED, 'facade-tint', id);
    tint = chooseTint(
      cls,
      m.wall.map((v) => v * (reg as Registry).gain),
      reg.mats,
      seed,
    );
    reg.memo.set(key, tint);
  }
  return { tint, glass: m.glass };
}

export function setFacadeMeasures(r: Omit<Registry, 'memo' | 'gain'> | null): void {
  if (!r) {
    reg = null;
    return;
  }
  const luma = (c: readonly number[]) =>
    0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1] ?? 1;
  const measured = med([...r.measures.values()].map((m) => luma(m.wall)));
  const predicted = med(Array.from({ length: 256 }, (_, t) => luma(predictWall(1, t, r.mats))));
  reg = { ...r, gain: measured > 0 ? predicted / measured : 1, memo: new Map() };
}

/** data/derived/facades/measures.json + 재질 매니페스트(data/derived/materials/<해시>/manifest.json, 가장 최근) → 등록. 없으면 등록 안 함(해시 tint). */
export function loadFacadeMeasures(derivedDir: string, log: Logger): boolean {
  const file = join(derivedDir, 'facades', 'measures.json');
  const matDir = join(derivedDir, 'materials');
  if (!existsSync(file) || !existsSync(matDir)) return false;
  const manifests = readdirSync(matDir)
    .map((d) => join(matDir, d, 'manifest.json'))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!manifests[0]) return false;
  const man = JSON.parse(readFileSync(manifests[0], 'utf8')) as {
    layers: { index: number; avgColor: [number, number, number] }[];
    groups: Record<string, number[]>;
  };
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    buildings: Record<string, [number, number, number, number]>;
  };
  const measures = new Map(
    Object.entries(data.buildings).map(([id, v]) => [
      id,
      { wall: [v[0], v[1], v[2]] as [number, number, number], glass: v[3] },
    ]),
  );
  setFacadeMeasures({
    measures,
    mats: { avg: new Map(man.layers.map((l) => [l.index, l.avgColor])), groups: man.groups },
  });
  log.info(`facade measures: ${measures.size} buildings (gain ${reg?.gain.toFixed(3)})`);
  return true;
}
