// 발소리 조각(M09-T04 — ADR-0079): 녹음에서 온셋을 찾아 한 걸음씩 잘라(앞 15 ms·최대 0.42 s·끝 40 ms 페이드) 피크 −3 dBFS로 맞추고,
// 0.1 s 무음을 사이에 두고 한 파일로 잇는다(런타임 = 오프셋으로 재생, 라운드로빈 + 피치 ±5 %).
import { monoOf, onsetsOf } from './analyze.ts';
import type { Pcm } from './ffmpeg.ts';

const PRE_S = 0.015;
const MAX_S = 0.42;
const FADE_S = 0.04;
const GAP_S = 0.1;
const PEAK_DBFS = -3;

export interface StepSheet {
  pcm: Pcm;
  /** [시작 s, 길이 s] × 걸음. */
  steps: [number, number][];
}

interface Cut {
  start: number;
  len: number;
  peak: number;
}

function cutsOf(mono: Float32Array, rate: number): Cut[] {
  const on = onsetsOf(mono, rate);
  const cuts: Cut[] = [];
  for (let i = 0; i < on.length; i++) {
    const start = Math.max(0, (on[i] as number) - Math.round(PRE_S * rate));
    const next = on[i + 1] ?? mono.length;
    const len = Math.min(Math.round(MAX_S * rate), next - start - Math.round(0.02 * rate), mono.length - start);
    if (len < 0.12 * rate) continue;
    let peak = 0;
    for (let j = 0; j < len; j++) peak = Math.max(peak, Math.abs(mono[start + j] as number));
    if (peak >= 0.99) continue; // 클리핑
    cuts.push({ start, len, peak });
  }
  return cuts;
}

/** 피크가 중앙값에 가까운 걸음 max개(너무 작거나 큰 것 제외 — 소리 크기 일관), 원래 순서 유지. */
function chooseCuts(cuts: Cut[], max: number): Cut[] {
  if (cuts.length <= max) return cuts;
  const med = [...cuts].sort((a, b) => a.peak - b.peak)[cuts.length >> 1]?.peak ?? 1;
  return [...cuts]
    .sort((a, b) => Math.abs(Math.log(a.peak / med)) - Math.abs(Math.log(b.peak / med)))
    .slice(0, max)
    .sort((a, b) => a.start - b.start);
}

export function sliceSteps(src: Pcm, maxSteps: number): StepSheet {
  const rate = src.rate;
  const mono = monoOf(src.data, src.channels);
  const picked = chooseCuts(cutsOf(mono, rate), maxSteps);
  if (picked.length < 2) throw new Error(`only ${picked.length} footsteps found`);
  const gap = Math.round(GAP_S * rate);
  const total = picked.reduce((a, c) => a + c.len + gap, gap);
  const out = new Float32Array(total);
  const steps: [number, number][] = [];
  let w = gap;
  const fade = Math.round(FADE_S * rate);
  for (const c of picked) {
    const g = 10 ** (PEAK_DBFS / 20) / c.peak;
    for (let j = 0; j < c.len; j++) {
      const f = j > c.len - fade ? (c.len - j) / fade : 1;
      out[w + j] = (mono[c.start + j] as number) * g * f;
    }
    steps.push([+(w / rate).toFixed(4), +(c.len / rate).toFixed(4)]);
    w += c.len + gap;
  }
  return { pcm: { rate, channels: 1, data: out }, steps };
}
