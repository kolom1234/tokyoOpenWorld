// 군중 필드(M06-T01): SAB 인스턴스 → 거리 LOD 풀·시야 원뿔(뒤 제외)·30 Hz 틱 외삽(속력 × 경과)·용량 초과 집계·그림자 드리우는 LOD0.
import type { SharedInstanceBuffer } from '@sanpo/core';
import { BufferAttribute, DataTexture, MeshBasicMaterial, PerspectiveCamera, Texture } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { CrowdAssets, CrowdBase } from '../src/internal/crowd/assets.ts';
import { createCrowdField } from '../src/internal/crowd/field.ts';

function fakeBase(id: string): CrowdBase {
  const a = (n: number) => new BufferAttribute(new Float32Array(3 * n), n);
  return {
    id,
    weight: 1,
    attributes: { position: a(3), normal: a(4), uv: a(2), _joints: a(4), _weights: a(4) },
    lods: [12, 30, 70, 250].map((maxDistM) => ({
      index: new BufferAttribute(new Uint16Array([0, 1, 2]), 1),
      maxDistM,
    })),
    row0: 0,
    clips: [{ start: 0, frames: 36 }],
  };
}

function source(rows: number[][], tickAbsMs: number): SharedInstanceBuffer & { tickAbsMs(): number } {
  const data = new Float32Array(rows.length * 8);
  rows.forEach((r, i) => {
    data.set(r, i * 8);
  });
  return {
    data,
    stride: 8,
    anchorWF: () => ({ x: 0, y: 0, z: 0 }),
    count: () => rows.length,
    seq: () => 1,
    tickAbsMs: () => tickAbsMs,
  };
}

describe('crowd field', () => {
  it('buckets instances by distance LOD, culls behind the camera and extrapolates walkers', () => {
    const f = createCrowdField();
    const assets = {
      manifest: {} as never,
      bases: [fakeBase('a')],
      palette: new DataTexture(),
      atlas: new Texture(),
      bones: 23,
    } as CrowdAssets;
    f.attach(assets, new MeshBasicMaterial());
    const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 5000);
    cam.position.set(0, 1.7, 0);
    cam.lookAt(0, 1.7, -10); // 북(−Z)을 본다
    cam.updateMatrixWorld();
    const now = performance.timeOrigin + performance.now();
    // x, y, z, yaw(전방 −Z = 0), anim(walk + 1.2 m/s), phase, variant, rate
    f.bind(
      source(
        [
          [0, 0, -5, 0, 0.12, 0, 0, 0.8], // LOD0(5 m), 걷는 중
          [2, 0, -25, 0, 0, 0.5, 0, 0], // LOD1
          [0, 0, -60, 0, 0, 0, 0, 0], // LOD2
          [0, 0, -200, 0, 0, 0, 0, 0], // LOD3
          [0, 0, -400, 0, 0, 0, 0, 0], // 250 m 밖
          [0, 0, 30, 0, 0, 0, 0, 0], // 뒤
        ],
        now - 100,
      ),
    );
    expect(f.update(cam, { x: 0, y: 0, z: 0 })).toBe(true);
    const st = f.stats();
    expect(st.instances).toBe(6);
    expect(st.lods).toEqual([1, 1, 1, 1]);
    expect(st.casters).toBe(1);
    // LOD0 풀의 첫 인스턴스: 100 ms × 1.2 m/s 앞(−Z)으로.
    const pool = f.root.children.find((m) => m.name === 'crowd/a/lod0') as unknown as {
      geometry: { attributes: Record<string, BufferAttribute>; instanceCount: number };
    };
    expect(pool.geometry.instanceCount).toBe(1);
    const z = pool.geometry.attributes._ipos?.array[2] as number;
    expect(z).toBeLessThan(-5.1);
    expect(z).toBeGreaterThan(-5.2);
  });

  it('counts pool overflow as dropped', () => {
    const f = createCrowdField();
    f.attach(
      {
        manifest: {} as never,
        bases: [fakeBase('a')],
        palette: new DataTexture(),
        atlas: new Texture(),
        bones: 23,
      } as CrowdAssets,
      new MeshBasicMaterial(),
    );
    const cam = new PerspectiveCamera(60, 1, 0.1, 5000);
    cam.position.set(0, 1.7, 0);
    cam.lookAt(0, 1.7, -10);
    cam.updateMatrixWorld();
    f.bind(
      source(
        Array.from({ length: 60 }, (_, i) => [i * 0.05, 0, -5, 0, 0, 0, 0, 0]),
        0,
      ),
    );
    f.update(cam, { x: 0, y: 0, z: 0 });
    expect(f.stats().lods[0]).toBe(48);
    expect(f.stats().dropped).toBe(12);
  });
});
