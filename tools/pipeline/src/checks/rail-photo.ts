// M07-T01 수락: 선로 중심선 vs GSI 항공사진(seamlessphoto z18 ≈ 0.49 m/px, 검증 전용 — photo-tiles.ts) ≤ 1 m.
// 지표 = **횡단면 거울 대칭 중심**: 25 m마다(터널·교량·승강장 제외) 선로에 수직인 밝기 단면(±3 m, 0.1 m)을 앞뒤 5개(±4 m) 평균 →
// 후보 중심 c(±1.2 m)마다 |I(c + d) − I(c − d)| 합(d = 0.2–1.3 m)이 최소인 c = 사진 속 궤도(침목·도상) 중심. 오차 = |c|.
// 한계: 0.49 m/px에서 궤간(1.067 m)은 2 px — 그림자·고가·이웃 선로가 대칭을 흐린다(검토 PNG로 눈 확인 병행).
// 사용(컨테이너 — ImageMagick): node tools/pipeline/src/checks/rail-photo.ts <buildId> [노선 접두 = yamanote] [최대 표본 = 200]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createLogger } from '@sanpo/core';
import { gunzip, parseRail, RAIL_FLAG } from '@sanpo/tile-format';
import { debugImage, type Mosaic, mosaicAround, sample } from './photo-tiles.ts';

const log = createLogger().child('rail-photo');
const ROOT = resolve(import.meta.dirname, '../../../..');
export const TOLERANCE_M = 1;
const EVERY_M = 25;
const HALF_M = 3;
const STEP_M = 0.1;
/** 후보 중심 범위 — 이웃 선로(중심 간격 ≈ 3.8 m)와의 가운데(≈ 1.9 m)도 대칭이라 그 앞까지만. */
const SEARCH_M = 1.2;

/** 단면 I(t), t ∈ [−HALF, HALF] — 점 (x, z)에서 법선 (nx, nz) 방향. */
function section(m: Mosaic, x: number, z: number, nx: number, nz: number): Float64Array {
  const n = Math.round((2 * HALF_M) / STEP_M) + 1;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = -HALF_M + k * STEP_M;
    out[k] = sample(m, x + nx * t, z + nz * t);
  }
  return out;
}

/** 거울 대칭 중심(m, 단면 좌표). */
export function symmetryCenter(I: Float64Array): number {
  const at = (t: number) => {
    const k = Math.round((t + HALF_M) / STEP_M);
    return I[Math.min(Math.max(k, 0), I.length - 1)] as number;
  };
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let c = -SEARCH_M; c <= SEARCH_M + 1e-9; c += STEP_M) {
    let s = 0;
    for (let d = 0.2; d <= 1.3 + 1e-9; d += STEP_M) s += Math.abs(at(c + d) - at(c - d));
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** 검토용 PNG(data/derived/rail-photo/NN.png): 이 노선 선로 전부(노랑) + 맞춘 중심(빨강, 표본 ±10 m). */
async function debugAt(
  m: Mosaic,
  N: { points: Float32Array; tracks: { ptOffset: number; ptCount: number; line: string }[] },
  g: number,
  c: number,
  n: number,
  line: string,
) {
  const P = (q: number): [number, number] => [N.points[q * 3] as number, N.points[q * 3 + 2] as number];
  const [x, z] = P(g);
  const shapes: { color: string; ringXZ: [number, number][] }[] = [];
  for (const t of N.tracks.filter((q) => q.line === line)) {
    const pl: [number, number][] = [];
    for (let q = t.ptOffset; q < t.ptOffset + t.ptCount; q += 4) {
      const p = P(q);
      if (Math.hypot(p[0] - x, p[1] - z) < 30) pl.push(p);
    }
    if (pl.length > 1) shapes.push({ color: 'yellow', ringXZ: [...pl, ...[...pl].reverse()] });
  }
  const [ax, az] = P(g - 20);
  const [bx, bz] = P(g + 20);
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const [nx, nz] = [(bz - az) / L, -(bx - ax) / L];
  shapes.push({
    color: 'red',
    ringXZ: [
      [ax + nx * c, az + nz * c],
      [bx + nx * c, bz + nz * c],
      [ax + nx * c, az + nz * c],
    ],
  });
  mkdirSync(join(ROOT, 'data/derived/rail-photo'), { recursive: true });
  await debugImage(ROOT, m, shapes, join(ROOT, 'data/derived/rail-photo', `${String(n).padStart(2, '0')}.png`));
}

async function main(): Promise<void> {
  const [buildId, prefix = 'yamanote', maxN = '200'] = process.argv.slice(2);
  if (!buildId) throw new Error('usage: rail-photo <buildId> [line prefix] [max samples]');
  const raw = await gunzip(new Uint8Array(readFileSync(join(ROOT, 'data/build', buildId, 'global/rail.bin'))));
  const net = raw.ok ? parseRail(raw.value) : undefined;
  if (!net?.ok) throw new Error('rail.bin parse failed');
  const N = net.value;
  const errs: { track: string; s: number; offsetM: number }[] = [];
  for (const t of N.tracks.filter((q) => q.line === prefix || q.id.startsWith(`${prefix}-`))) {
    const every = Math.round(EVERY_M / t.stepM);
    let mosaic: Mosaic | undefined;
    let mc: [number, number] = [Number.NaN, Number.NaN];
    for (let k = every; k + every < t.ptCount && errs.length < Number(maxN); k += every) {
      const g = t.ptOffset + k;
      const f = N.flags[g] as number;
      if (f & (RAIL_FLAG.tunnel | RAIL_FLAG.bridge | RAIL_FLAG.platform)) continue;
      const P = (q: number): [number, number] => [N.points[q * 3] as number, N.points[q * 3 + 2] as number];
      const [x, z] = P(g);
      if (!mosaic || Math.hypot(x - mc[0], z - mc[1]) > 50) {
        mosaic = await mosaicAround(ROOT, [x, z], 70);
        mc = [x, z];
      }
      let acc: Float64Array | undefined;
      for (const dk of [-8, -4, 0, 4, 8]) {
        const q = g + dk;
        const [ax, az] = P(q - 1);
        const [bx, bz] = P(q + 1);
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const [px, pz] = P(q);
        const s = section(mosaic, px, pz, (bz - az) / L, -(bx - ax) / L);
        acc = acc ? acc.map((v, i) => v + (s[i] as number)) : s;
      }
      const c = symmetryCenter(acc as Float64Array);
      errs.push({ track: t.id, s: k * t.stepM, offsetM: Math.abs(c) });
      if (errs.length <= Number(process.env.RAIL_PHOTO_DEBUG ?? 0))
        await debugAt(await mosaicAround(ROOT, [x, z], 30), N, g, c, errs.length, t.line);
    }
  }
  const sorted = errs.map((e) => e.offsetM).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? Number.NaN;
  const summary = {
    samples: errs.length,
    medianM: q(0.5),
    p90M: q(0.9),
    maxM: q(1),
    over: errs.filter((e) => e.offsetM > TOLERANCE_M).length,
  };
  writeFileSync(
    join(ROOT, 'data/build', buildId, `rail-photo-${prefix}.json`),
    JSON.stringify({ summary, errs }, null, 1),
  );
  log.info(`rail photo ${prefix}: ${JSON.stringify(summary)}`);
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('rail-photo.ts')
)
  await main();
