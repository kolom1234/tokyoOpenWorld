// 열차 주행음 합성(11 §1 trainBus): 바퀴 굴림(저역 잡음) + 모터(톱니파 대역 통과, 속력 비례 음높이) + 레일 이음매 "타탄"
// (레일 25 m마다 대차 두 축 = 2.1 m 간격 두 번, 차체 13.8 m 뒤 대차 한 번 더). 차내(inside)는 고역을 깎는다. 녹음 없음.
import { noiseOf } from './sfx.ts';

export const RAIL_LEN_M = 25;
const AXLE_M = 2.1;
const BOGIE_M = 13.8;
const LOOKAHEAD_S = 0.25;

/** [t0, t1) 사이 이음매 소리 시각(주행 거리 s0에서 속력 v로) — 순수(테스트). */
export function jointTimes(s0: number, v: number, t0: number, t1: number): number[] {
  if (v < 0.5) return [];
  const out: number[] = [];
  const sEnd = s0 + v * (t1 - t0);
  const first = Math.floor((s0 - BOGIE_M - AXLE_M) / RAIL_LEN_M);
  for (let k = first; k * RAIL_LEN_M <= sEnd; k++) {
    const j = k * RAIL_LEN_M;
    for (const off of [0, AXLE_M, BOGIE_M, BOGIE_M + AXLE_M]) {
      const at = j + off;
      if (at >= s0 && at < sEnd) out.push(t0 + (at - s0) / v);
    }
  }
  return out.sort((a, b) => a - b);
}

export interface TrainVoice {
  update(speedMs: number, inside: boolean): void;
  dispose(): void;
}

/** 이음매 딸깍(대역 통과 잡음 25 ms). */
function click(ctx: AudioContext, out: AudioNode, at: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 700;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.setTargetAtTime(0, at + 0.004, 0.018);
  src.connect(f).connect(g).connect(out);
  src.start(at, (at * 7.3) % 0.9);
  src.stop(at + 0.12);
}

function trainNodes(ctx: AudioContext, dest: AudioNode) {
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 8000;
  out.connect(tone).connect(dest);
  const roll = ctx.createBufferSource();
  roll.buffer = noiseOf(ctx);
  roll.loop = true;
  const rollF = ctx.createBiquadFilter();
  rollF.type = 'lowpass';
  rollF.frequency.value = 220;
  const rollG = ctx.createGain();
  rollG.gain.value = 0;
  roll.connect(rollF).connect(rollG).connect(out);
  roll.start();
  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  const motorF = ctx.createBiquadFilter();
  motorF.type = 'bandpass';
  motorF.Q.value = 3;
  const motorG = ctx.createGain();
  motorG.gain.value = 0;
  motor.connect(motorF).connect(motorG).connect(out);
  motor.start();
  return { out, tone, roll, rollG, motor, motorF, motorG };
}

export function createTrainVoice(ctx: AudioContext, dest: AudioNode): TrainVoice {
  const n = trainNodes(ctx, dest);
  let dist = 0;
  let last = ctx.currentTime;
  let scheduledUntil = ctx.currentTime;
  return {
    update(v, inside) {
      const now = ctx.currentTime;
      dist += v * (now - last);
      last = now;
      const k = Math.min(1, v / 25);
      n.rollG.gain.setTargetAtTime(0.05 + 0.35 * k, now, 0.3);
      n.motor.frequency.setTargetAtTime(40 + v * 38, now, 0.3);
      n.motorF.frequency.setTargetAtTime(200 + v * 60, now, 0.3);
      n.motorG.gain.setTargetAtTime(v > 0.3 ? 0.04 + 0.08 * (1 - Math.abs(k - 0.5) * 2) : 0, now, 0.4);
      n.tone.frequency.setTargetAtTime(inside ? 1800 : 8000, now, 0.3);
      const until = now + LOOKAHEAD_S;
      if (until > scheduledUntil) {
        const sNow = dist + v * (scheduledUntil - now);
        for (const t of jointTimes(sNow, v, scheduledUntil, until)) click(ctx, n.out, t, 0.25 + 0.35 * k);
        scheduledUntil = until;
      }
    },
    dispose() {
      n.roll.stop();
      n.motor.stop();
      n.out.disconnect();
      n.tone.disconnect();
    },
  };
}

/** 자동차 엔진·타이어(11 §1 vehicleBus): 4기통 점화 주파수(rpm/30) 톱니파 + 타이어 잡음(속력). drive 모드가 생기면 쓴다(M10). */
export function createEngineVoice(
  ctx: AudioContext,
  dest: AudioNode,
): {
  update(s: { rpm: number; throttle: number; speed: number } | null): void;
  dispose(): void;
} {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(lp).connect(g).connect(dest);
  osc.start();
  const tire = ctx.createBufferSource();
  tire.buffer = noiseOf(ctx);
  tire.loop = true;
  const tf = ctx.createBiquadFilter();
  tf.type = 'bandpass';
  tf.frequency.value = 500;
  const tg = ctx.createGain();
  tg.gain.value = 0;
  tire.connect(tf).connect(tg).connect(dest);
  tire.start();
  return {
    update(s) {
      const now = ctx.currentTime;
      if (!s) {
        g.gain.setTargetAtTime(0, now, 0.2);
        tg.gain.setTargetAtTime(0, now, 0.2);
        return;
      }
      osc.frequency.setTargetAtTime(Math.max(20, s.rpm / 30), now, 0.05);
      lp.frequency.setTargetAtTime(300 + 1500 * s.throttle, now, 0.1);
      g.gain.setTargetAtTime(0.06 + 0.12 * s.throttle, now, 0.1);
      tg.gain.setTargetAtTime(Math.min(0.25, s.speed / 80), now, 0.2);
    },
    dispose() {
      osc.stop();
      tire.stop();
      g.disconnect();
      tg.disconnect();
    },
  };
}
