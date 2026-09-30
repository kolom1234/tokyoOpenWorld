// 자판기(M05-T03, 가상 브랜드 — 로고·상표 없음): 상업·주거 용도(카탈로그 usage) 건물 지면 링의 길가 변(바깥 3 m 안에 보도·차도)을 따라
// 누적 길이 perFacadeM(± 절반 난수)마다 벽에 붙여(wallGapM 0.08 — 캐릭터 지름 0.5 m보다 좁은 뒤 틈이 생기면 끼인다) 1–2대(나란히 1.15 m), 정면 = 벽 바깥.
// 차도 위·다른 건물 안이면 건너뜀. see ADR-0051
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { type PlaceCtx, place, rngFor, type V2, yawOf } from './context.ts';

const FACING_PROBE_M = 3;
const MIN_EDGE_M = 1.5;
const HALF_DEPTH_M = 0.4;
const PAIR_GAP_M = 1.15;
const PAIR_P = 0.4;

function signedArea(r: readonly number[]): number {
  let a = 0;
  const n = r.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (r[i * 3] as number) * (r[j * 3 + 2] as number) - (r[j * 3] as number) * (r[i * 3 + 2] as number);
  }
  return a / 2;
}

interface Edge {
  a: V2;
  u: V2;
  L: number;
  n: V2;
}

/** 길가 변(바깥 법선 n 방향 3 m에 보도·차도). */
function streetEdges(c: PlaceCtx, ring: readonly number[]): Edge[] {
  const out: Edge[] = [];
  const cnt = ring.length / 3;
  const sgn = signedArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < cnt; i++) {
    const j = (i + 1) % cnt;
    const a: V2 = [ring[i * 3] as number, ring[i * 3 + 2] as number];
    const v: V2 = [(ring[j * 3] as number) - a[0], (ring[j * 3 + 2] as number) - a[1]];
    const L = Math.hypot(v[0], v[1]);
    if (L < MIN_EDGE_M) continue;
    const u: V2 = [v[0] / L, v[1] / L];
    const n: V2 = [u[1] * sgn, -u[0] * sgn];
    const m: V2 = [a[0] + v[0] / 2 + n[0] * FACING_PROBE_M, a[1] + v[1] / 2 + n[1] * FACING_PROBE_M];
    if (c.roads.classify(m[0], m[1]) !== 'none') out.push({ a, u, L, n });
  }
  return out;
}

function placeAt(c: PlaceCtx, e: Edge, s: number, gap: number): boolean {
  const back = gap + HALF_DEPTH_M;
  const p: V2 = [e.a[0] + e.u[0] * s + e.n[0] * back, e.a[1] + e.u[1] * s + e.n[1] * back];
  if (c.roads.classify(p[0], p[1]) === 'road' || c.inIntersection(p[0], p[1]) || c.inBuilding(p[0], p[1])) return false;
  return place(c, 'vendingMachine', p, yawOf(e.n));
}

export function placeVending(c: PlaceCtx, buildings: readonly BuildingRecord[]): number {
  const k = c.catalog.types.vendingMachine.place as { perFacadeM: number; wallGapM: number; usage: string[] };
  const usage = new Set(k.usage);
  let n = 0;
  for (const b of buildings) {
    if (!b.usage || !usage.has(b.usage)) continue;
    const rng = rngFor(c, 'vending', b.gmlId);
    let next = rng.next() * k.perFacadeM;
    let acc = 0;
    for (const s of b.surfaces) {
      const ring = s.kind === 'ground' ? s.ringsWF[0] : undefined;
      if (!ring || ring.length < 9) continue;
      for (const e of streetEdges(c, ring)) {
        while (next <= acc + e.L) {
          const t = Math.min(Math.max(next - acc, 0.6), e.L - 0.6);
          if (placeAt(c, e, t, k.wallGapM)) {
            n++;
            if (rng.next() < PAIR_P && t + PAIR_GAP_M < e.L - 0.6 && placeAt(c, e, t + PAIR_GAP_M, k.wallGapM)) n++;
          }
          next += k.perFacadeM * (0.5 + rng.next());
        }
        acc += e.L;
      }
    }
  }
  return n;
}
