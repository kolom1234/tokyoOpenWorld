// 나무 풀(M05-T04): Mesh + InstancedBufferGeometry(InstancedMesh 아님 — three r186은 InstancedMesh마다 노드 빌드를 따로 해서, 같은 머티리얼·속성 배치의
// 풀들이 셰이더 빌드를 공유하게). 한 풀의 수피·잎 기하가 인스턴스 속성 `_ipos`·`_iext`를 공유한다. see ADR-0052
import type { Vec3d } from '@sanpo/core';
import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
} from 'three/webgpu';
import type { TreeBlock, TreeSlice } from './blocks.ts';

export interface TreePool {
  meshes: Mesh[];
  geos: InstancedBufferGeometry[];
  ipos: InstancedBufferAttribute;
  iext: InstancedBufferAttribute;
}

function instanced(
  base: BufferGeometry,
  ipos: InstancedBufferAttribute,
  iext: InstancedBufferAttribute,
): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) g.setAttribute(name, base.getAttribute(name));
  if (base.index) g.setIndex(base.index);
  g.setAttribute('_ipos', ipos);
  g.setAttribute('_iext', iext);
  g.instanceCount = 0;
  return g;
}

/** 임포스터 사각형(−1..1, uv 0..1, +Z 법선). */
export function impostorQuad(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new BufferAttribute(Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function makeTreePool(
  name: string,
  cap: number,
  parts: { base: BufferGeometry; material: Material }[],
  shadow: boolean,
): TreePool {
  const ipos = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const iext = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const geos = parts.map((p) => instanced(p.base, ipos, iext));
  const meshes = parts.map((p, i) => {
    const m = new Mesh(geos[i], p.material);
    m.name = `${name}/${p.material.name}`;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.castShadow = shadow;
    // 그림자 받기도 상세 LOD만 — 간략·임포스터는 화소마다 4단 캐스케이드 표본이 숲 비용의 큰 몫(측정), 멀리선 안 보인다.
    m.receiveShadow = shadow;
    return m;
  });
  return { meshes, geos, ipos, iext };
}

/** 조각들을 풀에 복사(셀 원점 − 렌더 원점). 반환 = 잘린 수. */
export function writeTreePool(
  p: TreePool,
  parts: readonly { s: TreeSlice; b: TreeBlock }[],
  origin: Readonly<Vec3d>,
): number {
  const cap = p.ipos.count;
  const ipos = p.ipos.array as Float32Array;
  const iext = p.iext.array as Float32Array;
  let at = 0;
  let dropped = 0;
  for (const { s, b } of parts) {
    const n = Math.min(s.n, cap - at);
    dropped += s.n - n;
    if (n <= 0) continue;
    ipos.set(s.ipos.subarray(0, n * 4), at * 4);
    iext.set(s.iext.subarray(0, n * 4), at * 4);
    const [dx, dy, dz] = [b.origin.x - origin.x, b.origin.y - origin.y, b.origin.z - origin.z];
    for (let k = at; k < at + n; k++) {
      ipos[k * 4] = (ipos[k * 4] as number) + dx;
      ipos[k * 4 + 1] = (ipos[k * 4 + 1] as number) + dy;
      ipos[k * 4 + 2] = (ipos[k * 4 + 2] as number) + dz;
    }
    at += n;
  }
  for (const g of p.geos) g.instanceCount = at;
  for (const a of [p.ipos, p.iext]) {
    if (at === 0) continue;
    a.clearUpdateRanges();
    a.addUpdateRange(0, at * 4);
    a.needsUpdate = true;
  }
  return dropped;
}
