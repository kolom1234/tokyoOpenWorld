// 더미 보행자(M06-T01 수락 장면): 중심 주위 원 궤도 걷기(반경·속력·방향 = 시드), 일부는 서서 대기·휴대폰. 결정론 = createRng(hash32(WORLD_SEED, 'dummy', i)).
// 클립 번호 = 군중 클립 순서(walk 0·walk_slow 1·walk_fast 2·idle 3·phone 4 — content/characters/catalog.json과 같은 순서).
import { createRng, hash32, type Vec3d, WORLD_SEED } from '@sanpo/core';
import type { CrowdParams } from '../../api.ts';
import { STRIDE } from '../worker/instance-buffer.ts';

export const CLIP = { walk: 0, walkSlow: 1, walkFast: 2, idle: 3, phone: 4 } as const;

export type { CrowdParams } from '../../api.ts';

export interface DummyAgent {
  radius: number;
  theta: number;
  /** 각속도(rad/s, 부호 = 방향). 0 = 서 있음. */
  omega: number;
  speed: number;
  clip: number;
  phase: number;
  variant: number;
  /** 서 있는 사람 방위(rad). */
  yaw: number;
}

const DUMMY_KIND = 0x64756d6d; // 'dumm'

export function createDummyAgents(p: CrowdParams): DummyAgent[] {
  const out: DummyAgent[] = [];
  const d = p.dummy;
  for (let i = 0; i < d.count; i++) {
    const rng = createRng(hash32(WORLD_SEED, DUMMY_KIND, i));
    // 면적 균일: r = sqrt(u) 보간.
    const radius = Math.sqrt(d.minRadiusM ** 2 + rng.next() * (d.maxRadiusM ** 2 - d.minRadiusM ** 2));
    const theta = rng.next() * Math.PI * 2;
    const roll = rng.next();
    const variant = Math.floor(rng.next() * 65536);
    const phase = rng.next();
    if (roll < d.idleShare + d.phoneShare) {
      const clip = roll < d.idleShare ? CLIP.idle : CLIP.phone;
      out.push({ radius, theta, omega: 0, speed: 0, clip, phase, variant, yaw: rng.next() * Math.PI * 2 });
      continue;
    }
    const speed = 0.85 + rng.next() * 0.8;
    const clip = speed < 1.05 ? CLIP.walkSlow : speed > 1.5 ? CLIP.walkFast : CLIP.walk;
    const dir = rng.next() < 0.5 ? -1 : 1;
    out.push({ radius, theta, omega: (dir * speed) / radius, speed, clip, phase, variant, yaw: 0 });
  }
  return out;
}

/** dt 진행 + 버퍼 기록(WF − anchor). 반환 = 쓴 수. */
export function stepDummy(
  agents: DummyAgent[],
  p: CrowdParams,
  dt: number,
  center: Readonly<Vec3d>,
  anchor: Readonly<Vec3d>,
  out: Float32Array,
): number {
  let n = 0;
  for (const a of agents) {
    if ((n + 1) * STRIDE > out.length) break;
    let yaw = a.yaw;
    let rate: number;
    if (a.omega !== 0) {
      a.theta += a.omega * dt;
      // 접선 방향(위에서 반시계 θ 증가 = (−sin θ, cos θ) · 부호) → yaw(전방 = (−sin y, −cos y)).
      const s = Math.sign(a.omega);
      const dx = -Math.sin(a.theta) * s;
      const dz = Math.cos(a.theta) * s;
      yaw = Math.atan2(-dx, -dz);
      rate = a.speed / p.gaitCycleM;
    } else rate = 1 / p.idleLoopS;
    a.phase = (a.phase + rate * dt) % 1;
    const o = n * STRIDE;
    out[o] = center.x + Math.cos(a.theta) * a.radius - anchor.x;
    out[o + 1] = center.y - anchor.y;
    out[o + 2] = center.z + Math.sin(a.theta) * a.radius - anchor.z;
    out[o + 3] = yaw;
    out[o + 4] = a.clip + Math.min(a.speed, 9.99) / 10;
    out[o + 5] = a.phase;
    out[o + 6] = a.variant;
    out[o + 7] = rate;
    n++;
  }
  return n;
}
