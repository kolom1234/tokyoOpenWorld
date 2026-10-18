// 오디오 배선(M09-T04 — ADR-0079): @sanpo/audio 생성 + 첫 제스처 unlock + 셀 audio.json + 프레임 입력(리스너·환경·발소리·신호·열차·가려짐) + 볼륨 키.
// 볼륨 = 설정 화면(M10-T01 — shell/settings, flags.mix). `?debug=1`에서만 개발 단축키 `[` / `]` 마스터 −/+ 10 %·`\` 음소거(저장 안 함).
// `?audio=0` = 끔, `?vol=0.5` = 시작 마스터. 헤드리스·자동 재생 차단에서도 오류 없이 무음.
import { type AudioMix, type AudioService, createAudio, type NearTrain } from '@sanpo/audio';
import type { GameSystem, GroundQuery, Logger, Scheduler, TrainInfo, Vec3d } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { SimService } from '@sanpo/sim';
import type { StreamingService } from '@sanpo/streaming';
import type { TraversalService } from '@sanpo/traversal';
import { createVehicleAudio } from './vehicles/vehicle-audio.ts';
import type { StreamingRenderWiring } from './wiring/streaming-render.ts';

const VOL_STEP = 0.1;
/** 오디오 배선 phase(audio 60 직전). */
const WIRING_PHASE = 59;
const NEAR_TRAIN_R = 180;

export interface AudioFlags {
  /** `?audio=0`. */
  off?: boolean;
  /** `?vol=` 시작 마스터(0–1.5). */
  vol?: number;
  /** 설정의 믹스(시작값 — 바뀌면 shell이 setMix). */
  mix?: Partial<AudioMix>;
  /** `?debug=1` 볼륨 단축키. */
  devKeys?: boolean;
}

/** 태양 고도 → 밤 정도(render lighting/schedule nightOf와 같은 구간: +3° … −6°). */
export function nightOfSun(sunY: number): number {
  const lo = Math.sin((-6 * Math.PI) / 180);
  const hi = Math.sin((3 * Math.PI) / 180);
  const t = Math.min(Math.max((hi - sunY) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 군중 밀도 곡선(JST 시 — 새벽 0.15, 출근 0.8, 낮·저녁 1, 심야 0.3). */
export function crowdOfHour(h: number): number {
  const pts: [number, number][] = [
    [0, 0.35],
    [4, 0.12],
    [7, 0.55],
    [9, 0.85],
    [12, 1],
    [19, 1],
    [22, 0.65],
    [24, 0.35],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [h1, v1] = pts[i] as [number, number];
    const [h0, v0] = pts[i - 1] as [number, number];
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
  }
  return 0.35;
}

/** 열차 몸통(머리 → 꼬리 선분)에서 리스너에 가장 가까운 점. 방위 0 = −Z(도북). */
export function nearestOnTrain(t: TrainInfo, l: Vec3d): Vec3d {
  const len = t.cars * t.carLengthM;
  const dx = Math.sin(t.headingRad);
  const dz = Math.cos(t.headingRad);
  // 꼬리 = 머리에서 진행 반대(+sin, +cos 방향 = 뒤).
  const px = l.x - t.headPosWF.x;
  const pz = l.z - t.headPosWF.z;
  const s = Math.min(len, Math.max(0, px * dx + pz * dz));
  return { x: t.headPosWF.x + dx * s, y: t.headPosWF.y, z: t.headPosWF.z + dz * s };
}

function toast(doc: Document, text: string): void {
  let el = doc.getElementById('audio-toast');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'audio-toast';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);padding:6px 12px;border-radius:6px;' +
      'background:rgba(0,0,0,.65);color:#fff;font:13px system-ui,sans-serif;pointer-events:none;z-index:50;transition:opacity .3s';
    doc.body.append(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  const node = el;
  globalThis.setTimeout(() => {
    if (node.textContent === text) node.style.opacity = '0';
  }, 1200);
}

/** 첫 제스처 unlock + (개발) 볼륨 키. 반환 = 해제 함수. */
function bindControls(doc: Document, audio: AudioService, devKeys: boolean): () => void {
  let muted: number | null = null;
  const unlock = () => void audio.unlock();
  const onKey = (e: KeyboardEvent) => {
    if (!devKeys || (e.code !== 'BracketLeft' && e.code !== 'BracketRight' && e.code !== 'Backslash')) return;
    if (e.code === 'Backslash') {
      if (muted === null) {
        muted = audio.mix.master;
        audio.setMix({ master: 0 });
      } else {
        audio.setMix({ master: muted || 0.8 });
        muted = null;
      }
    } else {
      muted = null;
      const d = e.code === 'BracketRight' ? VOL_STEP : -VOL_STEP;
      audio.setMix({ master: Math.round((audio.mix.master + d) * 10) / 10 });
    }
    toast(
      doc,
      audio.mix.master === 0
        ? '소리 끔 (\\ 다시 켜기)'
        : `볼륨 ${Math.round(audio.mix.master * 100)} %  ( [ − · ] + · \\ 음소거 )`,
    );
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const)
    doc.addEventListener(ev, unlock, { capture: true });
  doc.addEventListener('keydown', onKey);
  return () => {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const)
      doc.removeEventListener(ev, unlock, { capture: true });
    doc.removeEventListener('keydown', onKey);
  };
}

export interface AudioWiringDeps {
  doc: Document;
  log: Logger;
  flags: AudioFlags;
  manifestUrl: string;
  scheduler: Pick<Scheduler, 'add'>;
  streaming: StreamingService;
  /** 셀 payload(render 배선이 나눠 줌 — streaming.onReady는 단일 소유). */
  cells: Pick<StreamingRenderWiring, 'onCell'>;
  sim: SimService;
  traversal: TraversalService;
  ground: GroundQuery;
  physics: () => PhysicsService | undefined;
  /** 노면 젖음(차 마찰과 같은 값 — `?wet=` 디버그 포함). 없으면 sim 날씨. */
  wetness?: () => number;
}

/** 가려짐: 리스너 → 소리 선분에 정적 지오메트리가 있으면(끝 1 m 전까지) 가려짐. */
function occluderOf(physics: () => PhysicsService | undefined) {
  return async (from: Vec3d, to: Vec3d): Promise<boolean> => {
    const p = physics();
    if (!p) return false;
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 2) return false;
    const hit = await p.raycast(from, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 1);
    return hit !== null;
  };
}

function frameSystem(d: AudioWiringDeps, audio: AudioService): GameSystem {
  const vehicle = createVehicleAudio(audio);
  return {
    id: 'wiring.audio',
    phase: WIRING_PHASE,
    update(f) {
      const t = d.traversal;
      const cam = t.camera;
      audio.setListener(cam, d.ground.groundHeightAt(cam.posWF.x, cam.posWF.z));
      const env = d.sim.environment();
      const h = ((((f.gameTimeMs / 3_600_000 + 9) % 24) + 24) % 24) as number;
      const walking = t.mode === 'walk';
      audio.setEnvironment({
        gameTimeMs: f.gameTimeMs,
        night: nightOfSun(env.sunDirWF.y),
        rainMmH: env.weather.rainMmH,
        windMs: env.weather.windMs,
        crowd: crowdOfHour(h),
        umbrella: walking && env.weather.rainMmH > 0.3,
      });
      const a = t.avatar;
      audio.setFootsteps(
        walking
          ? { speedMs: a.speedMs, grounded: a.grounded, material: a.groundMaterial ?? 0, wet: env.weather.wetness }
          : null,
      );
      const ride = t.hud.train ? d.sim.trainRide(t.hud.train.tripId) : undefined;
      audio.setTrainState(ride ? { speed: ride.speedMs, inside: t.hud.train?.view !== 'frontView' } : null);
      const near: NearTrain[] = d.sim
        .trainsNear(cam.posWF, NEAR_TRAIN_R)
        .map((tr) => ({ id: tr.tripId, posWF: nearestOnTrain(tr, cam.posWF), speedMs: tr.speedMs }));
      audio.setTrainsNear(near);
      vehicle(t, d.physics(), d.wetness?.() ?? env.weather.wetness);
    },
    dispose: () => undefined,
  };
}

/** 오디오 시작(월드 표시 뒤). `?audio=0`이면 undefined. */
export function startAudio(d: AudioWiringDeps): AudioService | undefined {
  if (d.flags.off) return undefined;
  const initialMix = { ...d.flags.mix, ...(d.flags.vol !== undefined ? { master: d.flags.vol } : {}) };
  const audio = createAudio({ log: d.log, manifestUrl: d.manifestUrl, initialMix });
  audio.setSignalSource((code) => d.sim.signalStateAt(code).ped);
  audio.setOccluder(occluderOf(d.physics));
  d.cells.onCell((p) => {
    if (p.audio) audio.addCell(p.key, p.audio);
  });
  d.streaming.onEvicted((key) => audio.removeCell(key));
  bindControls(d.doc, audio, d.flags.devKeys === true);
  const wiring = frameSystem(d, audio);
  d.scheduler.add({ systems: () => [wiring] });
  d.scheduler.add(audio);
  return audio;
}

/** world-view 배선용: 월드 baseUrl의 shared/audio/manifest.json. */
export function audioForWorld(
  deps: {
    canvas: HTMLCanvasElement;
    log: Logger;
    audio?: AudioFlags;
    scheduler: Pick<Scheduler, 'add'>;
    wetness?: () => number;
  },
  v: {
    traversal: TraversalService;
    ground: GroundQuery;
    sim: SimService;
    streaming: StreamingService;
    cells: Pick<StreamingRenderWiring, 'onCell'>;
  },
  baseUrl: string,
  physics: () => PhysicsService | undefined,
): AudioService | undefined {
  return startAudio({
    doc: deps.canvas.ownerDocument,
    log: deps.log,
    flags: deps.audio ?? {},
    manifestUrl: `${baseUrl}/shared/audio/manifest.json`,
    scheduler: deps.scheduler,
    ...v,
    physics,
    ...(deps.wetness ? { wetness: deps.wetness } : {}),
  });
}
