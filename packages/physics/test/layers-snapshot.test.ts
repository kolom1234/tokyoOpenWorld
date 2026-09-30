// 레이어 충돌 행렬(08 §3)·스냅샷 기록 보간·SAB seqlock(08 §9).
import { describe, expect, it } from 'vitest';
import type { Pose } from '../src/api.ts';
import { createSnapshotHistory, readSab } from '../src/internal/host/snapshot-reader.ts';
import { BODY_ALIVE, BODY_STRIDE, FRAME_F64, META_STRIDE, SNAPSHOT_BYTES } from '../src/internal/protocol.ts';
import { BP, BROADPHASE_OF, COLLISION_PAIRS, collides, OBJ } from '../src/internal/worker/layers.ts';
import { createSabSink, sabViews } from '../src/internal/worker/snapshot-writer.ts';

describe('layers (08 §3)', () => {
  it('matches the collision table (symmetric, no NPC/pedestrian self-collision, static never vs static)', () => {
    expect(collides(OBJ.CHARACTER, OBJ.STATIC_WORLD)).toBe(true);
    expect(collides(OBJ.STATIC_WORLD, OBJ.CHARACTER)).toBe(true);
    expect(collides(OBJ.CHARACTER, OBJ.CHARACTER)).toBe(false);
    expect(collides(OBJ.VEHICLE, OBJ.VEHICLE)).toBe(false);
    expect(collides(OBJ.NPC_KINEMATIC, OBJ.STATIC_WORLD)).toBe(false);
    expect(collides(OBJ.NPC_KINEMATIC, OBJ.NPC_KINEMATIC)).toBe(false);
    expect(collides(OBJ.TRAIN, OBJ.TERRAIN)).toBe(false);
    expect(collides(OBJ.TRAIN, OBJ.CHARACTER)).toBe(true);
    expect(collides(OBJ.STATIC_WORLD, OBJ.TERRAIN)).toBe(false);
    expect(COLLISION_PAIRS.length).toBe(14);
  });

  it('maps static layers to NON_MOVING, movers to MOVING and sensors to SENSOR', () => {
    expect(BROADPHASE_OF[OBJ.TERRAIN]).toBe(BP.NON_MOVING);
    expect(BROADPHASE_OF[OBJ.CHARACTER]).toBe(BP.MOVING);
    expect(BROADPHASE_OF[OBJ.SENSOR]).toBe(BP.SENSOR);
  });
});

/** 슬롯 0에 y만 다른 바디 하나가 있는 프레임. */
function frameAt(t: number, y: number, handle = 1, qy = 0): Float64Array {
  const f = new Float64Array(FRAME_F64);
  f[0] = t;
  const o = META_STRIDE;
  f[o + 1] = y;
  f[o + 5] = qy;
  f[o + 6] = Math.sqrt(1 - qy * qy);
  f[o + 8] = -y;
  f[o + 13] = BODY_ALIVE;
  f[o + 15] = handle;
  return f;
}

const pose = (): Pose => ({
  posWF: { x: 0, y: 0, z: 0 },
  quat: { x: 0, y: 0, z: 0, w: 1 },
  linVel: { x: 0, y: 0, z: 0 },
  grounded: false,
  groundMaterial: 0,
  escalator: false,
});

describe('snapshot history', () => {
  it('interpolates between the frames around the render time and clamps outside', () => {
    const h = createSnapshotHistory();
    h.push(frameAt(1.0, 10));
    h.push(frameAt(1.1, 8));
    h.push(frameAt(1.2, 4));
    const p = pose();
    expect(h.sample(0, 1, 1.15, p)).toBe(true);
    expect(p.posWF.y).toBeCloseTo(6, 12);
    expect(p.linVel.y).toBeCloseTo(-6, 12);
    h.sample(0, 1, 1.1, p);
    expect(p.posWF.y).toBe(8);
    h.sample(0, 1, 9, p);
    expect(p.posWF.y).toBe(4);
    h.sample(0, 1, 0, p);
    expect(p.posWF.y).toBe(10);
    // 다른 핸들(재사용 슬롯의 옛 핸들)은 없음.
    expect(h.sample(0, 2, 1.15, p)).toBe(false);
  });

  it('replaces the newest frame when time did not advance and snaps teleports (> 10 m)', () => {
    const h = createSnapshotHistory();
    h.push(frameAt(1.0, 10));
    h.push(frameAt(1.1, 9));
    h.push(frameAt(1.1, 50));
    const p = pose();
    h.sample(0, 1, 1.05, p);
    expect(p.posWF.y).toBe(50);
  });

  it('normalizes the interpolated rotation', () => {
    const h = createSnapshotHistory();
    h.push(frameAt(0, 0, 1, 0));
    h.push(frameAt(1, 0, 1, Math.sin(Math.PI / 4)));
    const p = pose();
    h.sample(0, 1, 0.5, p);
    expect(Math.hypot(p.quat.x, p.quat.y, p.quat.z, p.quat.w)).toBeCloseTo(1, 12);
  });
});

describe('SAB double buffer', () => {
  it('reads the newest committed frame once per sequence number', () => {
    const sab = new SharedArrayBuffer(SNAPSHOT_BYTES);
    const sink = createSabSink(sab);
    const { header, frames } = sabViews(sab);
    const dst = new Float64Array(FRAME_F64);
    expect(readSab(header, frames, 0, dst)).toBeNull();
    const f = sink.begin();
    f[0] = 2.5;
    f[META_STRIDE + BODY_STRIDE + 1] = 7;
    sink.commit();
    const seq = readSab(header, frames, 0, dst);
    expect(seq).toBe(1);
    expect([dst[0], dst[META_STRIDE + BODY_STRIDE + 1]]).toEqual([2.5, 7]);
    expect(readSab(header, frames, seq as number, dst)).toBeNull();
    // 두 번째 쓰기는 반대 버퍼.
    sink.begin()[0] = 3;
    sink.commit();
    expect(readSab(header, frames, 1, dst)).toBe(2);
    expect(dst[0]).toBe(3);
  });
});
