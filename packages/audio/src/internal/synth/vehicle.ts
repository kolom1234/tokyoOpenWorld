// 플레이어 탈것 소리(M08-T04, ADR-0090 — 11 §1 vehicleBus): 엔진(AudioWorklet engine-worklet.js, 불가하면 톱니 오실레이터) + 타이어 구름·젖은 노면 쉭·미끄럼 끽·바람
// + 자전거 체인·프리휠 딸깍. 전부 합성(녹음·실제 차종 소리 없음). 값은 setTargetAtTime 램프만(클릭 없음), 운전석 시점 = 실내 저역 통과.
import { JCOL_MATERIAL } from '@sanpo/tile-format';
import type { AudioStats, VehicleAudioState } from '../../api.ts';
import { noiseOf } from './sfx.ts';

const WORKLET_NAME = 'sanpo-engine';
const BIKE_WHEEL_R = 0.33;
/** 프리휠 래칫 이(한 바퀴 딸깍 수). */
const PAWL_TEETH = 18;

/** 상태 → 소리 목표(순수 — 테스트). 이득은 선형 0..1. */
export interface VehicleTargets {
  rpm: number;
  load: number;
  engine: number;
  roll: number;
  rollHz: number;
  wet: number;
  squeal: number;
  wind: number;
  windHz: number;
  chain: number;
  ticks: number;
  tickHz: number;
  cabinHz: number;
}

const SILENT: VehicleTargets = {
  rpm: 800,
  load: 0,
  engine: 0,
  roll: 0,
  rollHz: 200,
  wet: 0,
  squeal: 0,
  wind: 0,
  windHz: 400,
  chain: 0,
  ticks: 0,
  tickHz: 20,
  cabinHz: 6000,
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function vehicleTargets(s: VehicleAudioState | null): VehicleTargets {
  if (!s) return SILENT;
  const v = Math.abs(s.speedMs);
  const car = s.kind === 'car';
  const hard = s.surface === JCOL_MATERIAL.tile || s.surface === JCOL_MATERIAL.concrete;
  const load = car ? (s.shifting ? 0.05 : clamp01(s.throttle)) : 0;
  const pedal = !car && s.throttle > 0.05;
  return {
    rpm: Math.max(650, s.rpm),
    load,
    engine: car ? 0.22 + 0.3 * load + 0.12 * clamp01(s.rpm / 6000) : 0,
    roll: (car ? 0.2 : 0.09) * Math.min(1, (v / 25) ** 1.2),
    rollHz: (hard ? 320 : 160) + v * (car ? 7 : 14),
    wet: clamp01(s.wetness) * (car ? 0.16 : 0.09) * Math.min(1, v / 18),
    squeal: car && v > 2 ? clamp01((s.slip - 0.2) / 0.4) * 0.22 * (1 - 0.75 * clamp01(s.wetness)) : 0,
    wind: 0.22 * Math.min(1, (v / 38) ** 2) * (s.interior ? 0.4 : 1),
    windHz: 300 + v * 22,
    chain: pedal ? 0.05 * Math.min(1, v / 2.5) : 0,
    ticks: !car && !pedal && v > 0.6 ? 0.045 * Math.min(1, v / 2) : 0,
    tickHz: Math.max(1, (v / (2 * Math.PI * BIKE_WHEEL_R)) * PAWL_TEETH),
    cabinHz: s.interior ? 1500 : 7000,
  };
}

interface EngineSource {
  set(rpm: number, load: number, level: number): void;
  stop(): void;
}

function workletEngine(ctx: AudioContext, dest: AudioNode): EngineSource {
  const node = new AudioWorkletNode(ctx, WORKLET_NAME, { numberOfInputs: 0, outputChannelCount: [1] });
  node.connect(dest);
  const p = (n: string) => node.parameters.get(n) as AudioParam;
  return {
    set(rpm, load, level) {
      const t = ctx.currentTime;
      p('rpm').setTargetAtTime(rpm, t, 0.03);
      p('load').setTargetAtTime(load, t, 0.05);
      p('level').setTargetAtTime(level, t, 0.12);
    },
    stop: () => node.disconnect(),
  };
}

/** 워클릿 불가 대체: 점화 주파수 톱니 + 저역 통과. */
function oscEngine(ctx: AudioContext, dest: AudioNode): EngineSource {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(lp).connect(g).connect(dest);
  osc.start();
  return {
    set(rpm, load, level) {
      const t = ctx.currentTime;
      osc.frequency.setTargetAtTime(rpm / 30, t, 0.03);
      lp.frequency.setTargetAtTime(300 + 1500 * load, t, 0.1);
      g.gain.setTargetAtTime(level * 0.5, t, 0.12);
    },
    stop() {
      osc.stop();
      g.disconnect();
    },
  };
}

interface NoiseLayer {
  f: BiquadFilterNode;
  g: GainNode;
  src: AudioBufferSourceNode;
}

function noiseLayer(
  ctx: AudioContext,
  dest: AudioNode,
  type: BiquadFilterType,
  hz: number,
  q: number,
  at: number,
): NoiseLayer {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(dest);
  src.start(ctx.currentTime, at);
  return { f, g, src };
}

/** 프리휠 딸깍: 좁은 펄스 주기파(배음 같은 세기) → 고역 통과. */
function tickOsc(ctx: AudioContext, dest: AudioNode): { osc: OscillatorNode; g: GainNode } {
  const n = 32;
  const re = new Float32Array(n);
  const im = new Float32Array(n).fill(1);
  im[0] = 0;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ctx.createPeriodicWave(re, im, { disableNormalization: false }));
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(hp).connect(g).connect(dest);
  osc.start();
  return { osc, g };
}

/** 변속 "덜컥"(낮은 잡음 짧게). */
function clunk(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.005);
  g.gain.setTargetAtTime(0, t + 0.02, 0.02);
  src.connect(f).connect(g).connect(dest);
  src.start(t, 0.7);
  src.stop(t + 0.2);
}

/** 엔진 워클릿 적재(같은 출처 에셋 — Vite가 new URL 패턴을 보고 내보낸다), 실패하면 오실레이터. */
async function loadEngine(
  ctx: AudioContext,
  dest: AudioNode,
): Promise<EngineSource & { kind: 'worklet' | 'fallback' }> {
  try {
    if (!ctx.audioWorklet) throw new Error('no audioWorklet');
    await ctx.audioWorklet.addModule(new URL('./engine-worklet.js', import.meta.url).href);
    return { ...workletEngine(ctx, dest), kind: 'worklet' };
  } catch {
    return { ...oscEngine(ctx, dest), kind: 'fallback' };
  }
}

export interface VehicleVoice {
  update(s: VehicleAudioState | null): void;
  readonly engine: AudioStats['engine'];
  dispose(): void;
}

export function createVehicleVoice(ctx: AudioContext, dest: AudioNode): VehicleVoice {
  const cabin = ctx.createBiquadFilter();
  cabin.type = 'lowpass';
  cabin.frequency.value = 7000;
  cabin.connect(dest);
  const layers = {
    roll: noiseLayer(ctx, cabin, 'bandpass', 200, 0.9, 0),
    wet: noiseLayer(ctx, cabin, 'highpass', 2600, 0.7, 0.13),
    squeal: noiseLayer(ctx, cabin, 'bandpass', 1050, 14, 0.29),
    wind: noiseLayer(ctx, cabin, 'lowpass', 400, 0.5, 0.41),
    chain: noiseLayer(ctx, cabin, 'bandpass', 2300, 3, 0.57),
  };
  const ticks = tickOsc(ctx, cabin);
  let engine: EngineSource | null = null;
  let state: AudioStats['engine'] = 'off';
  let lastShift = false;
  let disposed = false;
  // 워클릿은 unlock 직후(아직 소리 없음) 적재 — Chrome은 첫 AudioWorkletNode 때 렌더링을 워클릿 스레드로 옮기며 한 번 끊긴다(운전 중이면 들림, 실측 결손 1).
  state = 'loading';
  void loadEngine(ctx, cabin).then((e) => {
    if (disposed) return e.stop();
    engine = e;
    state = e.kind;
  });
  return {
    update(s) {
      if (s?.kind === 'car' && s.shifting && !lastShift) clunk(ctx, cabin);
      lastShift = s?.shifting ?? false;
      const k = vehicleTargets(s);
      const t = ctx.currentTime;
      engine?.set(k.rpm, k.load, k.engine);
      cabin.frequency.setTargetAtTime(k.cabinHz, t, 0.2);
      layers.roll.g.gain.setTargetAtTime(k.roll, t, 0.15);
      layers.roll.f.frequency.setTargetAtTime(k.rollHz, t, 0.2);
      layers.wet.g.gain.setTargetAtTime(k.wet, t, 0.2);
      layers.squeal.g.gain.setTargetAtTime(k.squeal, t, 0.06);
      layers.wind.g.gain.setTargetAtTime(k.wind, t, 0.3);
      layers.wind.f.frequency.setTargetAtTime(k.windHz, t, 0.3);
      layers.chain.g.gain.setTargetAtTime(k.chain, t, 0.12);
      ticks.g.gain.setTargetAtTime(k.ticks, t, 0.1);
      ticks.osc.frequency.setTargetAtTime(k.tickHz, t, 0.1);
    },
    get engine() {
      return state;
    },
    dispose() {
      disposed = true;
      engine?.stop();
      for (const l of Object.values(layers)) {
        l.src.stop();
        l.g.disconnect();
      }
      ticks.osc.stop();
      cabin.disconnect();
    },
  };
}
