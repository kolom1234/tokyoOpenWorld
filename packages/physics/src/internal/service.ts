// createPhysics(08 §1·§9·§10): 워커(감독자) 또는 주입 전송 → init(앵커·SAB) → ready. 시스템 'physics'(phase 30)가 프레임마다
// step(메인 시계 targetS + 명령 묶음)을 보내고 스냅샷을 읽는다. pose()는 렌더 시각(지금 − 지연)으로 보간.
import type { CellKey, GameSystem, Vec3d, WorkerSupervisor } from '@sanpo/core';
import type {
  BodyHandle,
  JoltBuild,
  PhysicsConfig,
  PhysicsDeps,
  PhysicsIsolation,
  PhysicsService,
  PhysicsTransport,
  Pose,
  RayHit,
} from '../api.ts';
import { createCommandQueue } from './host/command-queue.ts';
import { createSnapshotHistory, readSab } from './host/snapshot-reader.ts';
import { FRAME_F64, type FromWorker, isIsolated, MAX_BODIES, SLOT_BITS, SNAPSHOT_BYTES, slotOf } from './protocol.ts';
import { sabViews } from './worker/snapshot-writer.ts';

/** 01-architecture §5 phase 표: physics = 30(traversal 20 뒤, traversalPost 35 앞). */
export const PHYSICS_PHASE = 30;

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  stepHz: 120,
  maxStepsPerTick: 4,
  interpolationDelayS: 1 / 60 + 1 / 120,
  isolation: 'auto',
  anchorGridM: 1024,
  cellBudgetMs: 3,
};

/** 08 §2: 앵커 = 첫 위치의 격자점(y = 0 — 도쿄 표고 < 100 m). */
export function anchorOf(p: Readonly<Vec3d>, gridM: number): Vec3d {
  return { x: Math.round(p.x / gridM) * gridM, y: 0, z: Math.round(p.z / gridM) * gridM };
}

function workerTransport(supervisor: WorkerSupervisor): PhysicsTransport & { onRestart(h: () => void): void } {
  const w = supervisor.spawn(
    'physics',
    // Vite가 이 패턴(new Worker(new URL(…, import.meta.url)))을 보고 워커 청크를 만든다.
    () => new Worker(new URL('./worker/physics.worker.ts', import.meta.url), { type: 'module', name: 'sanpo-physics' }),
  );
  return {
    post: (m, t) => void w.post(m, t),
    onMessage: (h) => w.onMessage(h),
    onRestart: (h) => void w.onRestart(h),
    terminate: () => w.terminate(),
  };
}

/** 핸들 = 슬롯 | (세대 << SLOT_BITS). */
function createHandles(): { alloc(): BodyHandle; free(h: BodyHandle): void; readonly count: number } {
  const gen = new Uint32Array(MAX_BODIES);
  const used = new Uint8Array(MAX_BODIES);
  let count = 0;
  return {
    alloc() {
      const slot = used.indexOf(0);
      if (slot < 0) throw new Error(`physics: body slots exhausted (${MAX_BODIES})`);
      used[slot] = 1;
      count++;
      gen[slot] = ((gen[slot] ?? 0) + 1) & 0xffff;
      return (slot | ((gen[slot] ?? 0) << SLOT_BITS)) as BodyHandle;
    },
    free(h) {
      const s = slotOf(h);
      if (used[s]) count--;
      used[s] = 0;
    },
    get count() {
      return count;
    },
  };
}

function isolationOf(mode: PhysicsConfig['isolation']): PhysicsIsolation {
  if (mode === 'shared') return typeof SharedArrayBuffer === 'function' ? 'shared' : 'degraded';
  return mode === 'auto' && isIsolated() ? 'shared' : 'degraded';
}

interface Link {
  readonly st: { ready: boolean; build: JoltBuild | null; initMs: number; seq: number };
  readonly ready: Promise<void>;
  off(): void;
}

/** 전송 메시지 처리 + init(재시작 시 다시). */
interface Handlers {
  snapshot(f: Float64Array): void;
  cellLoaded(key: CellKey): void;
  rayHit(id: number, hit: RayHit | null): void;
}

function connect(
  transport: PhysicsTransport,
  init: () => void,
  on: Handlers,
  log: PhysicsDeps['log'],
  isolation: PhysicsIsolation,
): Link {
  const st = { ready: false, build: null as JoltBuild | null, initMs: 0, seq: 0 };
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });
  const off = transport.onMessage((data) => {
    const m = data as FromWorker;
    if (m.t === 'ready') {
      Object.assign(st, { ready: true, build: m.build, initMs: m.initMs });
      log.info(`jolt ${m.build} ready in ${Math.round(m.initMs)} ms (${isolation})`);
      resolveReady();
    } else if (m.t === 'snapshot') on.snapshot(m.frame);
    else if (m.t === 'cellLoaded') on.cellLoaded(m.key);
    else if (m.t === 'rayHit') on.rayHit(m.id, m.hit);
    else if (m.t === 'warn') log.warn(m.message);
  });
  (transport as { onRestart?(h: () => void): void }).onRestart?.(() => {
    st.ready = false;
    log.warn('physics worker restarted — bodies lost, re-init');
    init();
  });
  init();
  return { st, ready, off };
}

function emptyPose(): Pose {
  return {
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    linVel: { x: 0, y: 0, z: 0 },
    grounded: false,
    groundMaterial: 0,
    escalator: false,
  };
}

/** 'physics'(phase 30): 준비되면 프레임마다 step 전송 + (SAB) 새 스냅샷 읽기. */
function createStepSystem(
  transport: PhysicsTransport,
  link: Link,
  queue: ReturnType<typeof createCommandQueue>,
  now: () => number,
  views: ReturnType<typeof sabViews> | undefined,
  onSnapshot: (f: Float64Array) => void,
): GameSystem {
  const { st } = link;
  const scratch = new Float64Array(FRAME_F64);
  return {
    id: 'physics',
    phase: PHYSICS_PHASE,
    update() {
      if (!st.ready) return;
      transport.post({ t: 'step', targetS: now() / 1000, cmds: queue.drain() });
      const seq = views ? readSab(views.header, views.frames, st.seq, scratch) : null;
      if (seq !== null) {
        st.seq = seq;
        onSnapshot(scratch);
      }
    },
    dispose() {
      link.off();
      transport.post({ t: 'dispose' });
      transport.terminate();
    },
  };
}

/** 셀 콜라이더 적재 상태(워커 cellLoaded 알림) + 레이캐스트 대기(id → resolve). */
function createTracking() {
  const loaded = new Set<CellKey>();
  const rays = new Map<number, (h: RayHit | null) => void>();
  let rayId = 0;
  return {
    loaded,
    handlers: (history: ReturnType<typeof createSnapshotHistory>): Handlers => ({
      snapshot: (f) => history.push(f),
      cellLoaded: (key) => loaded.add(key),
      rayHit(id, hit) {
        rays.get(id)?.(hit);
        rays.delete(id);
      },
    }),
    ray(post: (id: number) => void): Promise<RayHit | null> {
      const id = ++rayId;
      return new Promise((resolve) => {
        rays.set(id, resolve);
        post(id);
      });
    },
  };
}

type BodyApi = Pick<
  PhysicsService,
  'debugSpawnBox' | 'spawnCharacter' | 'setCharacterInput' | 'despawn' | 'teleport' | 'pose'
>;
type CellApi = Pick<PhysicsService, 'addCell' | 'removeCell' | 'hasCell' | 'raycast'>;

function bodyApi(
  queue: ReturnType<typeof createCommandQueue>,
  handles: ReturnType<typeof createHandles>,
  history: ReturnType<typeof createSnapshotHistory>,
  renderTimeS: () => number,
): BodyApi {
  const poses = new Map<number, Pose>();
  return {
    debugSpawnBox(posWF, half, dynamic) {
      const h = handles.alloc();
      queue.push({ c: 'box', h, posWF: { ...posWF }, half: { ...half }, dynamic });
      return h;
    },
    spawnCharacter(posWF, yaw) {
      const h = handles.alloc();
      queue.push({ c: 'character', h, posWF: { ...posWF }, yaw });
      return h;
    },
    setCharacterInput(h, i) {
      const moveWF = { x: i.moveWF.x, y: 0, z: i.moveWF.z };
      queue.push(i.yawRad === undefined ? { c: 'charInput', h, moveWF } : { c: 'charInput', h, moveWF, yaw: i.yawRad });
    },
    despawn(h) {
      handles.free(h);
      poses.delete(h);
      queue.push({ c: 'despawn', h });
    },
    teleport: (h, posWF, yaw) => queue.push({ c: 'teleport', h, posWF: { ...posWF }, yaw }),
    pose(h) {
      const p = poses.get(h) ?? emptyPose();
      poses.set(h, p);
      return history.sample(slotOf(h), h, renderTimeS(), p) ? p : undefined;
    },
  };
}

function cellApi(
  transport: PhysicsTransport,
  queue: ReturnType<typeof createCommandQueue>,
  track: ReturnType<typeof createTracking>,
): CellApi {
  return {
    addCell(key, originWF, jcol, hf) {
      track.loaded.delete(key);
      const transfer: Transferable[] = [];
      if (jcol) transfer.push(jcol);
      if (hf) transfer.push(hf.data.buffer as ArrayBuffer);
      transport.post({ t: 'addCell', key, originWF: { ...originWF }, jcol, hf }, transfer);
    },
    removeCell(key) {
      track.loaded.delete(key);
      queue.push({ c: 'removeCell', key });
    },
    hasCell: (key) => track.loaded.has(key),
    raycast: (originWF, dir, maxDist) =>
      track.ray((id) => transport.post({ t: 'ray', id, originWF: { ...originWF }, dir: { ...dir }, maxDist })),
  };
}

export function createPhysics(deps: PhysicsDeps): PhysicsService {
  const cfg: PhysicsConfig = { ...DEFAULT_PHYSICS_CONFIG, ...deps.config };
  const now = deps.now ?? (() => performance.now());
  const isolation = isolationOf(cfg.isolation);
  const anchorWF = anchorOf(deps.originWF, cfg.anchorGridM);
  const sab = isolation === 'shared' ? new SharedArrayBuffer(SNAPSHOT_BYTES) : null;
  const transport = deps.transport ?? (deps.supervisor ? workerTransport(deps.supervisor) : undefined);
  if (!transport) throw new Error('physics: supervisor or transport required');
  const queue = createCommandQueue();
  const history = createSnapshotHistory();
  const handles = createHandles();
  const track = createTracking();
  const init = (): void =>
    transport.post({
      t: 'init',
      sab,
      anchorWF,
      stepHz: cfg.stepHz,
      maxSteps: cfg.maxStepsPerTick,
      cellBudgetMs: cfg.cellBudgetMs,
    });
  const link = connect(transport, init, track.handlers(history), deps.log.child('physics'), isolation);
  const views = sab ? sabViews(sab) : undefined;
  const system = createStepSystem(transport, link, queue, now, views, (f) => history.push(f));
  return {
    ready: link.ready,
    isolation,
    ...bodyApi(queue, handles, history, () => now() / 1000 - cfg.interpolationDelayS),
    ...cellApi(transport, queue, track),
    stats: () => statsOf(history.latest, link.st, isolation, handles.count, anchorWF),
    systems: () => [system],
    dispose: () => system.dispose(),
  };
}

function statsOf(
  f: Float64Array | undefined,
  st: Link['st'],
  isolation: PhysicsIsolation,
  bodies: number,
  anchorWF: Vec3d,
): ReturnType<PhysicsService['stats']> {
  return {
    ready: st.ready,
    isolation,
    build: st.build,
    steps: f?.[1] ?? 0,
    simTimeS: f?.[0] ?? 0,
    bodies,
    initMs: st.initMs,
    tickMs: f?.[3] ?? 0,
    anchorWF,
    colliderPending: f?.[4] ?? 0,
    colliderCells: f?.[5] ?? 0,
    loadTickMaxMs: f?.[6] ?? 0,
    loadTicksOver8Ms: f?.[7] ?? 0,
  };
}
