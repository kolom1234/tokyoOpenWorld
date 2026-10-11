// createAudio(11 §5): 사용자 제스처 전에는 AudioContext를 만들지 않는다(재생 시도 금지 — 모듈 카드 불변식). unlock() 뒤 engine.ts가 소리를 낸다.
// AudioContext가 없는 환경(일부 헤드리스·테스트)은 'unavailable' — 모든 호출이 무음 no-op(e2e가 소리 없이도 통과).
import type { CameraState, CellKey, GameSystem, Logger, Vec3d } from '@sanpo/core';
import type { AudioZones } from '@sanpo/tile-format';
import type {
  AudioDeps,
  AudioEnv,
  AudioMix,
  AudioService,
  AudioStats,
  FootstepState,
  NearTrain,
  PedSignal,
  SfxId,
} from '../api.ts';
import type { Occluder } from './emitters.ts';
import { createEngine, type Engine, type EngineInputs } from './engine.ts';
import { DEFAULT_MIX } from './graph.ts';
import { ZoneIndex } from './zones.ts';

const clampMix = (m: AudioMix): AudioMix => {
  const out = { ...m };
  for (const k of Object.keys(out) as (keyof AudioMix)[])
    out[k] = Math.min(k === 'master' ? 1.5 : 1, Math.max(0, Number.isFinite(out[k]) ? out[k] : DEFAULT_MIX[k]));
  return out;
};

function emptyInputs(): EngineInputs {
  return {
    camera: null,
    groundY: undefined,
    env: null,
    steps: null,
    playerWF: { x: 0, y: 0, z: 0 },
    signal: null,
    occluder: null,
    train: null,
    vehicle: null,
    near: [],
  };
}

function contextFactory(deps: AudioDeps): (() => AudioContext) | null {
  if (deps.createContext) return deps.createContext;
  return typeof globalThis.AudioContext === 'function'
    ? () => new globalThis.AudioContext({ latencyHint: 'interactive' })
    : null;
}

class Audio implements AudioService {
  private readonly deps: AudioDeps;
  private readonly log: Logger;
  private readonly zones = new ZoneIndex();
  private readonly make: (() => AudioContext) | null;
  private readonly inputs = emptyInputs();
  private readonly system: GameSystem;
  private mixState: AudioMix;
  private st: AudioStats['state'];
  private engine: Engine | null = null;
  private ctx: AudioContext | null = null;
  private unlocking: Promise<void> | null = null;

  constructor(deps: AudioDeps) {
    this.deps = deps;
    this.log = deps.log.child('audio');
    this.make = contextFactory(deps);
    this.st = this.make ? 'locked' : 'unavailable';
    this.mixState = clampMix({ ...DEFAULT_MIX, ...deps.initialMix });
    this.system = {
      id: 'audio',
      phase: 60,
      update: (f) => {
        this.inputs.playerWF = f.player.posWF;
        if (!this.inputs.camera) this.inputs.camera = f.camera;
        if (this.st === 'running' && this.engine) this.engine.update(f.dtReal, this.inputs);
      },
      dispose: () => this.dispose(),
    };
  }

  get state(): AudioStats['state'] {
    return this.st;
  }
  get mix(): Readonly<AudioMix> {
    return this.mixState;
  }
  systems(): readonly GameSystem[] {
    return [this.system];
  }

  unlock(): Promise<void> {
    const make = this.make;
    if (this.st !== 'locked' || !make) return Promise.resolve();
    this.unlocking ??= (async () => {
      try {
        const ctx = make();
        this.ctx = ctx;
        const fetchFn = this.deps.fetchFn ?? ((u: string) => fetch(u));
        this.engine = createEngine({
          ctx,
          mix: this.mixState,
          zones: this.zones,
          fetchFn,
          log: this.log,
          ...(this.deps.manifestUrl ? { manifestUrl: this.deps.manifestUrl } : {}),
        });
        await ctx.resume();
        this.st = 'running';
        this.log.info(`unlocked (${ctx.sampleRate} Hz)`);
      } catch (e) {
        this.st = 'unavailable';
        this.log.warn('audio unavailable', e);
      }
    })();
    return this.unlocking;
  }

  setListener(camera: CameraState, groundY?: number): void {
    this.inputs.camera = camera;
    this.inputs.groundY = groundY;
  }
  addCell(key: CellKey, z?: AudioZones): void {
    if (z) this.zones.add(key, z);
  }
  removeCell(key: CellKey): void {
    this.zones.remove(key);
  }
  setEnvironment(e: AudioEnv): void {
    this.inputs.env = e;
  }
  setFootsteps(s: FootstepState | null): void {
    this.inputs.steps = s;
  }
  setSignalSource(f: ((code: number) => PedSignal) | null): void {
    this.inputs.signal = f;
  }
  setOccluder(f: Occluder | null): void {
    this.inputs.occluder = f;
  }
  playAt(id: SfxId, posWF: Vec3d, opts?: { gain?: number; pitch?: number }): void {
    if (this.st === 'running') this.engine?.playAt(id, posWF, opts?.gain ?? 1, opts?.pitch ?? 1);
  }
  playUi(id: SfxId): void {
    if (this.st === 'running') this.engine?.playUi(id);
  }
  setVehicleState(s: { rpm: number; throttle: number; speed: number; surface: number } | null): void {
    this.inputs.vehicle = s;
  }
  setTrainState(s: { speed: number; inside: boolean } | null): void {
    this.inputs.train = s;
  }
  setTrainsNear(t: readonly NearTrain[]): void {
    this.inputs.near = t;
  }
  setMix(m: Partial<AudioMix>): void {
    this.mixState = clampMix({ ...this.mixState, ...m });
    this.engine?.setMix(this.mixState);
  }

  stats(): AudioStats {
    const e = this.engine?.stats();
    return {
      state: this.st,
      zones: e?.zones ?? {},
      beds: e?.beds ?? [],
      loaded: this.engine?.assets.loaded() ?? 0,
      files: this.engine?.assets.files() ?? 0,
      voices: e?.voices ?? 0,
      signalTones: e?.tones ?? 0,
      steps: e?.steps ?? 0,
      mix: { ...this.mixState },
    };
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.unlocking = null;
    if (this.st === 'running') this.st = 'locked';
  }
}

export function createAudio(deps: AudioDeps): AudioService {
  return new Audio(deps);
}
