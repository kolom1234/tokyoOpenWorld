// 앰비언스 존 색인(11 §2, M09-T04 — ADR-0079): 셀 audio.json 다각형(셀 로컬 → WF) → 리스너 xz에서 종류별 가중.
// 리스너 둘레 원반 표본 32점의 존 포함 비율이라 경계를 지날 때 이득이 1/32 단위로 섞인다(클릭 0의 첫 단계 — 두 번째는 GainNode 램프).
import type { CellKey } from '@sanpo/core';
import { cellOriginWF } from '@sanpo/geo';
import { AUDIO_ZONE_KINDS, type AudioEmitter, type AudioZoneKind, type AudioZones } from '@sanpo/tile-format';

/** 존 가장자리 섞임 반경(m) — 경계 앞뒤 ≈ EDGE_M에 걸쳐 가중이 바뀐다. */
export const EDGE_M = 14;
const KINDS: ReadonlySet<string> = new Set(AUDIO_ZONE_KINDS);

interface Poly {
  kind: AudioZoneKind;
  /** WF xz 평탄 배열. */
  xz: Float64Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldEmitter {
  kind: string;
  x: number;
  y: number;
  z: number;
  code?: number;
}

function inside(xz: Float64Array, x: number, z: number): boolean {
  let c = false;
  const n = xz.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xz[i * 2] as number;
    const zi = xz[i * 2 + 1] as number;
    const xj = xz[j * 2] as number;
    const zj = xz[j * 2 + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * 원반 표본 32점(황금각 Vogel 배치 — x·z 오프셋이 모두 달라 경계를 지날 때 한 번에 하나씩만 바뀐다). 종류 가중 = 표본 중 그 종류 존 안 비율
 * (같은 종류 사각형끼리 맞닿은 경계에서 꺼지지 않는다).
 */
export const ZONE_SAMPLES = 32;
const SAMPLES: readonly (readonly [number, number])[] = Array.from({ length: ZONE_SAMPLES }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / ZONE_SAMPLES);
  const a = i * 2.399963229728653;
  return [r * Math.cos(a), r * Math.sin(a)] as const;
});

export class ZoneIndex {
  private readonly cells = new Map<CellKey, { polys: Poly[]; emitters: WorldEmitter[] }>();

  add(key: CellKey, zones: AudioZones): void {
    const o = cellOriginWF(key);
    const polys: Poly[] = [];
    for (const z of zones.zones) {
      if (z.polygonLocal.length < 3) continue;
      const xz = new Float64Array(z.polygonLocal.length * 2);
      z.polygonLocal.forEach(([x, zz], i) => {
        xz[i * 2] = o.x + x;
        xz[i * 2 + 1] = o.z + zz;
      });
      const xs = z.polygonLocal.map((p) => o.x + p[0]);
      const zs = z.polygonLocal.map((p) => o.z + p[1]);
      const kind = (KINDS.has(z.kind) ? z.kind : 'street') as AudioZoneKind;
      polys.push({
        kind,
        xz,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      });
    }
    const emitters = zones.emitters.map((e: AudioEmitter) => ({
      kind: e.kind,
      x: o.x + e.pos[0],
      y: o.y + e.pos[1],
      z: o.z + e.pos[2],
      ...(e.code === undefined ? {} : { code: e.code }),
    }));
    this.cells.set(key, { polys, emitters });
  }

  remove(key: CellKey): void {
    this.cells.delete(key);
  }

  get size(): number {
    return this.cells.size;
  }

  /** 종류별 가중(합 1). 표본이 어느 존에도 없으면 그 표본은 street. */
  weightsAt(x: number, z: number): Record<AudioZoneKind, number> {
    const w = Object.fromEntries(AUDIO_ZONE_KINDS.map((k) => [k, 0])) as Record<AudioZoneKind, number>;
    const near: Poly[] = [];
    for (const c of this.cells.values())
      for (const p of c.polys)
        if (x >= p.minX - EDGE_M && x <= p.maxX + EDGE_M && z >= p.minZ - EDGE_M && z <= p.maxZ + EDGE_M) near.push(p);
    for (const [ux, uz] of SAMPLES) {
      const sx = x + ux * EDGE_M;
      const sz = z + uz * EDGE_M;
      let hit: AudioZoneKind = 'street';
      for (const p of near)
        if (sx >= p.minX && sx <= p.maxX && sz >= p.minZ && sz <= p.maxZ && inside(p.xz, sx, sz)) {
          hit = p.kind;
          break;
        }
      w[hit] += 1 / SAMPLES.length;
    }
    return w;
  }

  /** 반경 r 안 발음체(종류 필터). */
  emittersNear(x: number, z: number, r: number, kind: string): WorldEmitter[] {
    const out: WorldEmitter[] = [];
    for (const c of this.cells.values())
      for (const e of c.emitters) if (e.kind === kind && (e.x - x) ** 2 + (e.z - z) ** 2 <= r * r) out.push(e);
    return out;
  }
}
