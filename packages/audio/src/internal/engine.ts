// 실행 중 오디오 엔진(unlock 뒤 생성): 버스·에셋·베드·보이스·유도음·열차를 묶고 프레임마다 갱신. service.ts가 상태·입력을 들고 이것을 부른다.
import { type CameraState, createRng, type Logger, type Rng, type Vec3d } from '@sanpo/core';
import type {
  AudioEnv,
  AudioMix,
  AudioStats,
  FootstepState,
  NearTrain,
  PedSignal,
  SfxId,
  VehicleAudioState,
} from '../api.ts';
import { type AssetStore, createAssetStore } from './assets.ts';
import { type BedPlayer, createBedPlayer } from './beds.ts';
import { createTonePlayer, type Occluder, type TonePlayer } from './emitters.ts';
import { StepClock, stepSetOf } from './footsteps.ts';
import { type BusGraph, createBusGraph } from './graph.ts';
import { bedGains } from './mixer.ts';
import { OutputClock } from './output-clock.ts';
import { noiseOf, playSfx } from './synth/sfx.ts';
import { createTrainVoice, type TrainVoice } from './synth/train.ts';
import { createVehicleVoice, type VehicleVoice } from './synth/vehicle.ts';
import { createVoicePool, type VoicePool } from './voices.ts';
import type { ZoneIndex } from './zones.ts';

/** 존·베드 재계산 간격(s). */
const ZONE_EVERY_S = 0.1;
/** 오디오 좌표 원점 격자(m) — WF 큰 값의 float32 정밀도(리스너 가까이 0 근처). */
const ORIGIN_GRID_M = 1024;
const NEAR_TRAIN_R = 150;
const MAX_NEAR_TRAINS = 2;

export interface EngineInputs {
  camera: CameraState | null;
  groundY: number | undefined;
  env: AudioEnv | null;
  steps: FootstepState | null;
  playerWF: Vec3d;
  signal: ((code: number) => PedSignal) | null;
  occluder: Occluder | null;
  train: { speed: number; inside: boolean } | null;
  vehicle: VehicleAudioState | null;
  near: readonly NearTrain[];
}

export interface Engine {
  readonly graph: BusGraph;
  readonly assets: AssetStore;
  update(dtS: number, i: EngineInputs): void;
  playAt(id: SfxId, posWF: Vec3d, gain: number, pitch: number): void;
  playUi(id: SfxId): void;
  setMix(m: AudioMix): void;
  stats(): {
    zones: Record<string, number>;
    beds: string[];
    voices: number;
    tones: number;
    steps: number;
    engine: AudioStats['engine'];
    clockGlitches: number;
  };
  dispose(): void;
}

function setListener(ctx: AudioContext, cam: CameraState, o: Vec3d): void {
  const L = ctx.listener;
  const t = ctx.currentTime;
  const { x, y, z, w } = cam.quat;
  // 앞(−Z)·위(+Y)를 쿼터니언으로 회전.
  const fx = -(2 * (x * z + w * y));
  const fy = -(2 * (y * z - w * x));
  const fz = -(1 - 2 * (x * x + y * y));
  const ux = 2 * (x * y - w * z);
  const uy = 1 - 2 * (x * x + z * z);
  const uz = 2 * (y * z + w * x);
  L.positionX.setValueAtTime(cam.posWF.x - o.x, t);
  L.positionY.setValueAtTime(cam.posWF.y - o.y, t);
  L.positionZ.setValueAtTime(cam.posWF.z - o.z, t);
  L.forwardX.setValueAtTime(fx, t);
  L.forwardY.setValueAtTime(fy, t);
  L.forwardZ.setValueAtTime(fz, t);
  L.upX.setValueAtTime(ux, t);
  L.upY.setValueAtTime(uy, t);
  L.upZ.setValueAtTime(uz, t);
}

/** 열차 합성음: 탑승 중 = 차내 1개(2D), 아니면 가까운 열차 2개(위치). */
class TrainSounds {
  private inside: TrainVoice | null = null;
  private readonly near = new Map<string, { voice: TrainVoice; panner: PannerNode }>();
  private readonly ctx: AudioContext;
  private readonly bus: AudioNode;
  constructor(ctx: AudioContext, bus: AudioNode) {
    this.ctx = ctx;
    this.bus = bus;
  }

  update(i: EngineInputs, listener: Vec3d, origin: Vec3d): void {
    if (i.train?.inside) {
      this.inside ??= createTrainVoice(this.ctx, this.bus);
      this.inside.update(i.train.speed, true);
    } else if (this.inside) {
      this.inside.dispose();
      this.inside = null;
    }
    const d2 = (t: NearTrain) => (t.posWF.x - listener.x) ** 2 + (t.posWF.z - listener.z) ** 2;
    const list = i.train?.inside
      ? []
      : i.near
          .filter((t) => d2(t) < NEAR_TRAIN_R ** 2)
          .sort((a, b) => d2(a) - d2(b))
          .slice(0, MAX_NEAR_TRAINS);
    const keep = new Set(list.map((t) => t.id));
    for (const [k, n] of this.near)
      if (!keep.has(k)) {
        n.voice.dispose();
        n.panner.disconnect();
        this.near.delete(k);
      }
    const now = this.ctx.currentTime;
    for (const t of list) {
      const n = this.near.get(t.id) ?? this.open(t.id);
      n.panner.positionX.setValueAtTime(t.posWF.x - origin.x, now);
      n.panner.positionY.setValueAtTime(t.posWF.y + 1 - origin.y, now);
      n.panner.positionZ.setValueAtTime(t.posWF.z - origin.z, now);
      n.voice.update(t.speedMs, false);
    }
  }

  private open(id: string) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.rolloffFactor = 1;
    panner.connect(this.bus);
    const n = { voice: createTrainVoice(this.ctx, panner), panner };
    this.near.set(id, n);
    return n;
  }

  dispose(): void {
    this.inside?.dispose();
    for (const n of this.near.values()) n.voice.dispose();
    this.near.clear();
  }
}

class AudioEngine implements Engine {
  readonly graph: BusGraph;
  readonly assets: AssetStore;
  private readonly beds: BedPlayer;
  private readonly voices: VoicePool;
  private readonly tones: TonePlayer;
  private readonly trains: TrainSounds;
  private readonly engineVoice: VehicleVoice;
  private readonly outClock = new OutputClock();
  private readonly rng: Rng = createRng(0x41_55_44);
  private readonly clock = new StepClock();
  private origin: Vec3d = { x: 0, y: 0, z: 0 };
  private listener: Vec3d = { x: 0, y: 0, z: 0 };
  private since = ZONE_EVERY_S;
  private weights: Record<string, number> = {};
  private stepsPlayed = 0;
  private readonly rand = () => this.rng.next();

  private readonly ctx: AudioContext;
  private readonly zones: ZoneIndex;
  constructor(
    ctx: AudioContext,
    zones: ZoneIndex,
    o: { mix: AudioMix; manifestUrl?: string; fetchFn: (url: string) => Promise<Response>; log: Logger },
  ) {
    this.ctx = ctx;
    this.zones = zones;
    this.graph = createBusGraph(ctx, o.mix);
    this.assets = createAssetStore({
      ctx,
      fetchFn: o.fetchFn,
      log: o.log,
      ...(o.manifestUrl ? { manifestUrl: o.manifestUrl } : {}),
    });
    this.beds = createBedPlayer(ctx, this.graph.buses.ambience, this.graph.sendOutdoor, this.assets);
    this.voices = createVoicePool(
      ctx,
      this.graph.buses.sfx,
      () => this.listener,
      () => this.origin,
    );
    this.tones = createTonePlayer(ctx, this.graph.buses.sfx, zones);
    this.trains = new TrainSounds(ctx, this.graph.buses.train);
    this.engineVoice = createVehicleVoice(ctx, this.graph.buses.vehicle);
  }

  private moveListener(cam: CameraState): void {
    this.listener = cam.posWF;
    const g = ORIGIN_GRID_M;
    const l = this.listener;
    const o = this.origin;
    if (Math.abs(l.x - o.x) > g || Math.abs(l.z - o.z) > g || Math.abs(l.y - o.y) > g)
      this.origin = { x: Math.round(l.x / g) * g, y: Math.round(l.y / g) * g, z: Math.round(l.z / g) * g };
    setListener(this.ctx, cam, this.origin);
  }

  private step(dtS: number, i: EngineInputs): void {
    const s = i.steps;
    if (!s) return;
    const set = stepSetOf(s.material);
    const e = this.assets.entry(set);
    const buf = this.assets.buffer(set);
    const ev = this.clock.advance(s.speedMs, s.grounded, dtS, e?.steps?.length ?? 0, this.rand);
    if (!ev || !buf || !e?.steps) return;
    const [t0, dur] = e.steps[ev.index] as [number, number];
    const v = this.voices.acquire({ ...i.playerWF, y: i.playerWF.y + 0.05 }, ev.gain, this.ctx.currentTime + dur + 0.1);
    if (!v) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = ev.rate;
    const g = this.ctx.createGain();
    g.gain.value = 0.55 * ev.gain;
    src.connect(g).connect(v.input);
    src.start(this.ctx.currentTime, t0, dur / ev.rate);
    if (s.wet > 0.3) this.splash(v.input, 0.25 * s.wet * ev.gain);
    this.stepsPlayed++;
  }

  /** 젖은 노면 물 튀김(고역 잡음 짧게). */
  private splash(dest: AudioNode, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = noiseOf(this.ctx);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + 0.02, 0.05);
    src.connect(f).connect(g).connect(dest);
    src.start(t, this.rand() * 0.5);
    src.stop(t + 0.3);
  }

  update(dtS: number, i: EngineInputs): void {
    if (i.camera) this.moveListener(i.camera);
    this.since += dtS;
    if (this.since >= ZONE_EVERY_S && i.env) {
      this.since = 0;
      const w = this.zones.weightsAt(this.listener.x, this.listener.z);
      this.weights = w;
      const agl = i.groundY === undefined ? 0 : this.listener.y - i.groundY;
      this.beds.update(bedGains(w, i.env, agl), this.rand);
      this.graph.setSpace(w.station);
    }
    this.step(dtS, i);
    this.tones.update(this.listener, this.origin, i.signal, i.occluder);
    this.trains.update(i, this.listener, this.origin);
    this.engineVoice.update(i.vehicle);
    this.outClock.update(this.ctx, dtS);
  }

  playAt(id: SfxId, posWF: Vec3d, gain: number, pitch: number): void {
    const v = this.voices.acquire(posWF, gain, this.ctx.currentTime + 2);
    if (v) playSfx(this.ctx, id, v.input, this.ctx.currentTime, gain, pitch);
  }

  playUi(id: SfxId): void {
    playSfx(this.ctx, id, this.graph.buses.ui, this.ctx.currentTime);
  }

  setMix(m: AudioMix): void {
    this.graph.setMix(m);
  }

  stats() {
    return {
      zones: this.weights,
      beds: this.beds.audible(),
      voices: this.voices.active(),
      tones: this.tones.active(),
      steps: this.stepsPlayed,
      engine: this.engineVoice.engine,
      clockGlitches: this.outClock.glitches,
    };
  }

  dispose(): void {
    this.beds.dispose();
    this.tones.dispose();
    this.trains.dispose();
    this.engineVoice.dispose();
    this.graph.dispose();
  }
}

export function createEngine(o: {
  ctx: AudioContext;
  mix: AudioMix;
  zones: ZoneIndex;
  manifestUrl?: string;
  fetchFn: (url: string) => Promise<Response>;
  log: Logger;
}): Engine {
  return new AudioEngine(o.ctx, o.zones, o);
}
