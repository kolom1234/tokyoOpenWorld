// 버스 그래프(11 §1): 버스별 GainNode → master → DynamicsCompressor → destination. 잔향 = 짧은 실외·긴 실내 ConvolverNode 2개(절차 IR), 존 가중으로 보냄 이득.
import type { AudioBus, AudioMix } from '../api.ts';

export const DEFAULT_MIX: AudioMix = { master: 0.8, ambience: 0.8, sfx: 0.9, vehicle: 0.8, train: 0.8, ui: 0.7 };
/** 이득 램프 시정수(s) — 계단 없이(클릭 0). */
export const RAMP_TAU_S = 0.12;

export interface BusGraph {
  ctx: AudioContext;
  buses: Record<AudioBus, GainNode>;
  /** 잔향 보냄(실외·실내). 입력을 여기에 연결하면 잔향을 거쳐 master로. */
  sendOutdoor: GainNode;
  sendHall: GainNode;
  setMix(m: AudioMix): void;
  /** 실내(역) 가중 0..1 → 잔향 균형. */
  setSpace(indoor: number): void;
  dispose(): void;
}

/** 지수 감쇠 잡음 IR(스테레오, 결정론 — LCG). */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number, seed: number): AudioBuffer {
  const n = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = seed >>> 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = ((s / 0x1_0000_0000) * 2 - 1) * (1 - i / n) ** decay;
    }
  }
  return buf;
}

export function createBusGraph(ctx: AudioContext, mix: AudioMix): BusGraph {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(comp);
  const mk = (): GainNode => {
    const g = ctx.createGain();
    g.connect(master);
    return g;
  };
  const buses: Record<AudioBus, GainNode> = { master, ambience: mk(), sfx: mk(), vehicle: mk(), train: mk(), ui: mk() };
  const outdoor = ctx.createConvolver();
  outdoor.buffer = impulse(ctx, 0.9, 3.5, 7);
  const hall = ctx.createConvolver();
  hall.buffer = impulse(ctx, 2.6, 2.2, 11);
  const sendOutdoor = ctx.createGain();
  const sendHall = ctx.createGain();
  const wetOut = ctx.createGain();
  const wetHall = ctx.createGain();
  sendOutdoor.connect(outdoor).connect(wetOut).connect(master);
  sendHall.connect(hall).connect(wetHall).connect(master);
  wetOut.gain.value = 0.18;
  wetHall.gain.value = 0;
  const ramp = (p: AudioParam, v: number) => p.setTargetAtTime(v, ctx.currentTime, RAMP_TAU_S);
  const g: BusGraph = {
    ctx,
    buses,
    sendOutdoor,
    sendHall,
    setMix(m) {
      for (const b of Object.keys(buses) as AudioBus[]) ramp(buses[b].gain, m[b]);
    },
    setSpace(indoor) {
      ramp(wetOut.gain, 0.18 * (1 - indoor));
      ramp(wetHall.gain, 0.32 * indoor);
    },
    dispose() {
      master.disconnect();
      comp.disconnect();
    },
  };
  g.setMix(mix);
  return g;
}
