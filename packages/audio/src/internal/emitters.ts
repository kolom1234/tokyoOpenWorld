// 음향식 보행 신호 발음체(11 §2 crossing): audio.json signalTone 중 리스너 45 m 안 가까운 6개 — 보행 W이면 유도음 음형을 0.3 s 앞까지 예약.
// 발음체마다 PannerNode(HRTF) + 로우패스(가려짐 1.2 kHz, 11 §1 — occluder가 있으면 4 Hz로 판정).
import type { Vec3d } from '@sanpo/core';
import { AUDIO_EMITTER } from '@sanpo/tile-format';
import type { PedSignal } from '../api.ts';
import { notesBetween, patternOfCode } from './synth/signal-tones.ts';
import { OCCLUDED_HZ } from './voices.ts';
import type { WorldEmitter, ZoneIndex } from './zones.ts';

export const TONE_RADIUS_M = 45;
export const MAX_TONES = 6;
const LOOKAHEAD_S = 0.3;
const OCCLUSION_HZ = 4;
/** 유도음 크기(신호기 스피커 — 확성 아님). */
const TONE_GAIN = 0.22;

interface Active {
  key: string;
  e: WorldEmitter;
  panner: PannerNode;
  filter: BiquadFilterNode;
  until: number;
  occludedAt: number;
}

export type Occluder = (from: Vec3d, to: Vec3d) => Promise<boolean>;

export interface TonePlayer {
  update(listener: Vec3d, origin: Vec3d, signal: ((code: number) => PedSignal) | null, occluder: Occluder | null): void;
  active(): number;
  dispose(): void;
}

const keyOf = (e: WorldEmitter) => `${e.x.toFixed(1)},${e.z.toFixed(1)}`;

/** 보행 W인 가까운 발음체 MAX_TONES개(거리순). */
function wanted(zones: ZoneIndex, l: Vec3d, signal: ((code: number) => PedSignal) | null): WorldEmitter[] {
  if (!signal) return [];
  const d2 = (e: WorldEmitter) => (e.x - l.x) ** 2 + (e.z - l.z) ** 2;
  return zones
    .emittersNear(l.x, l.z, TONE_RADIUS_M, AUDIO_EMITTER.signalTone)
    .filter((e) => signal(e.code ?? 0) === 'W')
    .sort((a, b) => d2(a) - d2(b))
    .slice(0, MAX_TONES);
}

/** 음형 예약(oscillator + 짧은 어택·릴리스 — 클릭 없이). */
function scheduleNotes(ctx: AudioContext, a: Active): void {
  const code = a.e.code ?? 0;
  const to = ctx.currentTime + LOOKAHEAD_S;
  for (const { at, note } of notesBetween(patternOfCode(code), code, Math.max(a.until, ctx.currentTime), to)) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(note.f0, at);
    o.frequency.linearRampToValueAtTime(note.f1, at + note.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(TONE_GAIN * note.gain, at + 0.008);
    g.gain.setValueAtTime(TONE_GAIN * note.gain, at + note.dur - 0.015);
    g.gain.linearRampToValueAtTime(0, at + note.dur);
    o.connect(g).connect(a.filter);
    o.start(at);
    o.stop(at + note.dur + 0.02);
  }
  a.until = to;
}

class Tones implements TonePlayer {
  private readonly live = new Map<string, Active>();
  private readonly ctx: AudioContext;
  private readonly dest: AudioNode;
  private readonly zones: ZoneIndex;
  constructor(ctx: AudioContext, dest: AudioNode, zones: ZoneIndex) {
    this.ctx = ctx;
    this.dest = dest;
    this.zones = zones;
  }

  private open(e: WorldEmitter, key: string): Active {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20_000;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.rolloffFactor = 1.2;
    filter.connect(panner).connect(this.dest);
    const a = { key, e, panner, filter, until: this.ctx.currentTime, occludedAt: 0 };
    this.live.set(key, a);
    return a;
  }

  private close(a: Active): void {
    a.filter.disconnect();
    a.panner.disconnect();
    this.live.delete(a.key);
  }

  private occlude(a: Active, listener: Vec3d, occluder: Occluder): void {
    const now = this.ctx.currentTime;
    if (now - a.occludedAt <= 1 / OCCLUSION_HZ) return;
    a.occludedAt = now;
    occluder(listener, { x: a.e.x, y: a.e.y, z: a.e.z })
      .then((occ) => a.filter.frequency.setTargetAtTime(occ ? OCCLUDED_HZ : 20_000, this.ctx.currentTime, 0.15))
      .catch(() => {});
  }

  update(
    listener: Vec3d,
    origin: Vec3d,
    signal: ((code: number) => PedSignal) | null,
    occluder: Occluder | null,
  ): void {
    const want = wanted(this.zones, listener, signal);
    const keys = new Set(want.map(keyOf));
    for (const a of [...this.live.values()]) if (!keys.has(a.key)) this.close(a);
    const now = this.ctx.currentTime;
    for (const e of want) {
      const a = this.live.get(keyOf(e)) ?? this.open(e, keyOf(e));
      a.panner.positionX.setValueAtTime(e.x - origin.x, now);
      a.panner.positionY.setValueAtTime(e.y - origin.y, now);
      a.panner.positionZ.setValueAtTime(e.z - origin.z, now);
      scheduleNotes(this.ctx, a);
      if (occluder) this.occlude(a, listener, occluder);
    }
  }

  active(): number {
    return this.live.size;
  }

  dispose(): void {
    for (const a of [...this.live.values()]) this.close(a);
  }
}

export function createTonePlayer(ctx: AudioContext, dest: AudioNode, zones: ZoneIndex): TonePlayer {
  return new Tones(ctx, dest, zones);
}
