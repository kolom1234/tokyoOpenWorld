// 앰비언스 루프(M09-T04 — ADR-0079): 원천에서 지속 음조·큰 순간음이 가장 적은 구간을 골라 등전력 교차로 이음매 없는 루프를 만든다.
import { FFT_SIZE, HOP, monoOf, rmsEnvelope, spectrogramDb, tonalTrack } from './analyze.ts';
import type { Pcm } from './ffmpeg.ts';

/** 루프 이음 교차 길이(s). */
export const LOOP_XFADE_S = 1.5;
/** 목표 RMS(dBFS) — 베드끼리 섞을 때 기준 레벨(런타임 믹스가 다시 조정). */
export const BED_TARGET_DBFS = -24;
/** 구간 후보 보폭(s). */
const STEP_S = 1;

export interface LoopPick {
  startS: number;
  /** 구간 평균 지속 음조 비율(0..1). */
  tonal: number;
  /** 구간 최대 1 s RMS ÷ 평균(순간 큰 소리 — 경적·고함). */
  crest: number;
  score: number;
}

/** 길이 lenS(+ 교차) 구간 후보 중 점수 최소. 점수 = 평균 음조 + 0.15 × max(0, crest − 2). */
export function pickLoopWindow(pcm: Pcm, lenS: number): LoopPick {
  const mono = monoOf(pcm.data, pcm.channels);
  const tonal = tonalTrack(spectrogramDb(mono), pcm.rate);
  const sec = rmsEnvelope(mono, pcm.rate, pcm.rate);
  const totalS = mono.length / pcm.rate;
  const need = lenS + LOOP_XFADE_S;
  if (totalS < need) throw new Error(`source ${totalS.toFixed(1)} s < loop ${need} s`);
  const frameS = HOP / pcm.rate;
  let best: LoopPick | undefined;
  for (let s = 0; s + need <= totalS; s += STEP_S) {
    const f0 = Math.floor(s / frameS);
    const f1 = Math.min(tonal.length, Math.floor((s + need - FFT_SIZE / pcm.rate) / frameS));
    let t = 0;
    for (let f = f0; f < f1; f++) t += tonal[f] as number;
    t /= Math.max(1, f1 - f0);
    let mean = 0;
    let max = 0;
    const s0 = Math.floor(s);
    const s1 = Math.min(sec.length, Math.floor(s + need));
    for (let i = s0; i < s1; i++) {
      mean += sec[i] as number;
      max = Math.max(max, sec[i] as number);
    }
    mean /= Math.max(1, s1 - s0);
    const crest = mean > 0 ? max / mean : 1;
    const score = t + 0.15 * Math.max(0, crest - 2);
    if (!best || score < best.score) best = { startS: s, tonal: t, crest, score };
  }
  return best as LoopPick;
}

/** 구간 [startS, startS + lenS + 교차) → 길이 lenS 루프: 앞 교차 구간 = 머리(페이드 인) + 꼬리(페이드 아웃) 등전력 합. */
export function makeLoop(pcm: Pcm, startS: number, lenS: number): Pcm {
  const ch = pcm.channels;
  const n = Math.round(lenS * pcm.rate);
  const x = Math.round(LOOP_XFADE_S * pcm.rate);
  const s0 = Math.round(startS * pcm.rate);
  const out = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const head = pcm.data[(s0 + i) * ch + c] as number;
      if (i >= x) {
        out[i * ch + c] = head;
        continue;
      }
      const tail = pcm.data[(s0 + n + i) * ch + c] as number;
      const a = (i / x) * (Math.PI / 2);
      out[i * ch + c] = head * Math.sin(a) + tail * Math.cos(a);
    }
  }
  return { rate: pcm.rate, channels: pcm.channels, data: out };
}

/** RMS를 targetDbfs로 맞추고 표본 최대 −1 dBFS로 제한. 반환 = 적용 이득(dB). */
export function normalizeRms(pcm: Pcm, targetDbfs: number): number {
  let s = 0;
  let peak = 0;
  for (const v of pcm.data) {
    s += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(s / Math.max(1, pcm.data.length));
  if (rms <= 0) return 0;
  let g = 10 ** (targetDbfs / 20) / rms;
  const lim = 10 ** (-1 / 20);
  if (peak * g > lim) g = lim / peak;
  for (let i = 0; i < pcm.data.length; i++) pcm.data[i] = (pcm.data[i] as number) * g;
  return 20 * Math.log10(g);
}
