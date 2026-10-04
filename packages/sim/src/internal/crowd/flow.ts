// tier B 흐름 보행자(10 §4.2, M06-T04 — ADR-0064): 80–250 m. Detour 에이전트 없이 경로 꺾은선(computePath 모서리)을 일정 속력으로 따라간다 — 회피 없음,
// 횡단·신호 대기는 tier A와 같은 규칙(decideRoute·crossingPoints·exitPoint — 같은 대기점·좌측 보행 차로라 승격·강등 때 자리가 이어진다).
// 가로 흔들림(±0.3 m)은 출력에만. 전원 매 틱 이동(싼 산술 — 10 §4.2의 "4프레임 분할"은 불필요, 경로 계획만 틱당 상한).
import { canMakeIt, decideRoute, exitPoint, type FsmCtx } from './agent-fsm.ts';
import { type PedIdentity, STATE } from './appearance.ts';
import { crossingPoints, type V3 } from './route.ts';

export interface FlowAgent extends PedIdentity {
  pos: V3;
  /** 따라갈 꺾은선 모서리(다음 = pts[next]). */
  pts: V3[];
  next: number;
  needPlan: boolean;
  /** 마지막 틱 속도(xz) — yaw·클립·외삽. */
  vx: number;
  vz: number;
  /** 출력 가로 오프셋 목표(m, 진행 방향 오른쪽 +)·지금 값(강등 직후 0에서 천천히 — 승강격 때 옆으로 튀지 않게). */
  side: number;
  sideNow: number;
  /** 가로 오프셋 방향 기준(진행 방향 저역 통과, 시정수 HEADING_TAU_S — 모퉁이·되돌기에서 옆으로 튀지 않게). */
  hx: number;
  hz: number;
}

const HEADING_TAU_S = 0.6;

/** 가로 오프셋이 목표로 가는 속력(m/s). */
const SIDE_RATE = 0.15;

const lerp = (r: readonly [number, number], t: number): number => r[0] + (r[1] - r[0]) * t;

/** 그려지는 자리 = 꺾은선 위치 + 진행 방향(저역 통과) 오른쪽 × 가로 오프셋. */
export function sidePos(f: FlowAgent): V3 {
  // h는 정규화하지 않는다(|h| ≤ 1): 되돌기에서 h가 0을 지나며 방향이 한 틱에 뒤집히지 않고 오프셋이 줄었다 다시 커진다.
  const k = f.sideNow;
  return { x: f.pos.x - f.hz * k, y: f.pos.y, z: f.pos.z + f.hx * k };
}

export function newFlow(id: PedIdentity, pos: V3): FlowAgent {
  return {
    ...id,
    pos: { ...pos },
    pts: [],
    next: 0,
    needPlan: true,
    vx: 0,
    vz: 0,
    side: (id.rng.next() - 0.5) * 0.6,
    sideNow: 0,
    hx: 0,
    hz: 0,
  };
}

function route(c: FsmCtx, from: V3, to: V3, all: boolean): V3[] | undefined {
  const r = c.nav.query.computePath(from, to, {
    filter: all ? c.nav.allFilter : c.nav.walkFilter,
    halfExtents: { x: 2, y: 3, z: 2 },
  });
  return r.success && r.path.length >= 1 ? r.path : undefined;
}

/** 횡단 시작: 대기점 → 띠 끝 너머 첫 보도까지(횡단 포함 필터). */
function startCrossFlow(c: FsmCtx, f: FlowAgent): void {
  if (!f.hit) return;
  const pts = crossingPoints(f.hit, f.lat, f.depth);
  const exit = exitPoint(c, pts.exit, pts.dir) ?? pts.exit;
  f.state = STATE.cross;
  f.pts = route(c, f.pos, exit, true) ?? [exit];
  f.next = 0;
}

/** 경로 계획: 횡단 중(강등 직후)이면 출구까지, 아니면 decideRoute(목적지·첫 횡단 대기점). */
export function planFlow(c: FsmCtx, f: FlowAgent): void {
  f.needPlan = false;
  if (f.state === STATE.cross) {
    startCrossFlow(c, f);
    return;
  }
  if (f.state === STATE.wait || f.state === STATE.dwell) return;
  const leg = decideRoute(c, f, f.pos);
  if (!leg) {
    f.state = STATE.dwell;
    f.timer = 2;
    return;
  }
  const pts = route(c, f.pos, leg.to, false);
  if (!pts) {
    // 경로 없음(모서리가 내비 밖) — 직선으로 가면 건물을 뚫으니 잠깐 멈췄다 다른 목적지로.
    f.dest = undefined;
    f.state = STATE.dwell;
    f.timer = 2;
    return;
  }
  f.pts = pts;
  f.next = 0;
}

function arrive(c: FsmCtx, f: FlowAgent): void {
  if (f.state === STATE.approach) {
    f.state = STATE.wait;
    f.react = lerp(c.p.reactionS, f.rng.next());
  } else if (f.state === STATE.walk && f.rng.next() < c.p.dwellShare) {
    f.state = STATE.dwell;
    f.timer = lerp(c.p.dwellS, f.rng.next());
  } else {
    f.state = STATE.walk;
    f.needPlan = true;
  }
}

/** dt 진행: 대기(보행 램프)·멈춤·꺾은선 이동. */
export function stepFlow(c: FsmCtx, f: FlowAgent, dt: number): void {
  f.vx = 0;
  f.vz = 0;
  f.sideNow += Math.max(-SIDE_RATE * dt, Math.min(SIDE_RATE * dt, f.side - f.sideNow));
  if (f.state === STATE.wait) {
    if ((f.hit ? c.ped(f.hit.rec.signal) : 'W') !== 'W') f.react = lerp(c.p.reactionS, f.rng.next());
    else {
      f.react -= dt;
      if (f.react <= 0 && canMakeIt(c, f)) startCrossFlow(c, f);
    }
    return;
  }
  if (f.state === STATE.dwell) {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.state = STATE.walk;
      f.needPlan = true;
    }
    return;
  }
  if (f.needPlan) return;
  const hurry = f.state === STATE.cross && f.hit && c.ped(f.hit.rec.signal) !== 'W' ? 1.35 : 1;
  let left = f.speed * hurry * dt;
  const x0 = f.pos.x;
  const z0 = f.pos.z;
  while (left > 0 && f.next < f.pts.length) {
    const q = f.pts[f.next] as V3;
    const dx = q.x - f.pos.x;
    const dy = q.y - f.pos.y;
    const dz = q.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= left) {
      f.pos = { ...q };
      f.next++;
      left -= d;
    } else {
      const k = left / d;
      f.pos = { x: f.pos.x + dx * k, y: f.pos.y + dy * k, z: f.pos.z + dz * k };
      left = 0;
    }
  }
  if (dt > 0) {
    f.vx = (f.pos.x - x0) / dt;
    f.vz = (f.pos.z - z0) / dt;
    const sp = Math.hypot(f.vx, f.vz);
    if (sp > 0.05) {
      const k = Math.min(1, dt / HEADING_TAU_S);
      f.hx += (f.vx / sp - f.hx) * k;
      f.hz += (f.vz / sp - f.hz) * k;
    }
  }
  if (f.next >= f.pts.length) arrive(c, f);
}
