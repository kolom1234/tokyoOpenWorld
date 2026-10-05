// 원경 군중 tier C(10 §4.2, M06-T04 — ADR-0064): sim 밖(250 m+) 사람은 렌더 전용 스프라이트. L0 셀 roads.mesh의 보도 윗면(`_SURF` 1) 삼각형에서
// 면적 비례로 점을 뽑아(셀 키 해시 — 결정론) 두고, 카메라 235–800 m 점만 세운 사각형(카메라 쪽 가로, 0.55 × 1.7 m)으로 — 옷·피부 2색, 가는 실루엣,
// 제자리 왕복 걸음(±2.5 m)·몸 흔들림, 235–265 m·700–800 m 디더 페이드. 밀도 = setDensity(k)(게임이 sim 군중 수 ÷ 목표로 — 시간대·날씨가 원경에도).
import { type CellKey, hash32, type Vec3d } from '@sanpo/core';
import type { DecodedMesh } from '@sanpo/tile-format';
import {
  abs,
  attribute,
  cos,
  Discard,
  Fn,
  fract,
  mix,
  positionLocal,
  positionPrevious,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  type PerspectiveCamera,
  type Node as TslNode,
  Vector3,
} from 'three/webgpu';

/** 보도 m²당 원경 사람(밀도 1일 때) — 근경 sim 1,000명 / 반경 250 m 보도 면적과 비슷하게. */
export const FAR_PER_M2 = 0.015;
export const FAR_CAPACITY = 12000;
const NEAR_M = 235;
const FAR_M = 800;
/** 이만큼 움직이거나 셀이 바뀌면 다시 고른다. */
const REFILL_M = 8;

export interface FarCrowdStats {
  points: number;
  drawn: number;
}

export interface FarCrowd {
  readonly root: Group;
  addCell(key: CellKey, originWF: Readonly<Vec3d>, roads: DecodedMesh | undefined): void;
  removeCell(key: CellKey): void;
  setDensity(k: number): void;
  /** 카메라(렌더 좌표)·렌더 원점·시각(s). */
  update(camera: PerspectiveCamera, renderOriginWF: Readonly<Vec3d>, timeS: number): void;
  stats(): FarCrowdStats;
}

/** 보도 삼각형 → WF 점(x, y, z, 씨앗 0..1). */
export function samplePoints(key: CellKey, originWF: Readonly<Vec3d>, roads: DecodedMesh): Float32Array {
  const out: number[] = [];
  let tri = 0;
  for (const p of roads.primitives) {
    const pos = p.attributes.POSITION?.array as Float32Array | undefined;
    const surf = p.attributes._SURF?.array as ArrayLike<number> | undefined;
    if (!pos || !surf) continue;
    const idx = p.index;
    const n = idx ? idx.length : pos.length / 3;
    for (let t = 0; t + 2 < n; t += 3, tri++) {
      const i0 = idx ? (idx[t] as number) : t;
      if (Math.round(surf[i0] as number) !== 1) continue;
      const i1 = idx ? (idx[t + 1] as number) : t + 1;
      const i2 = idx ? (idx[t + 2] as number) : t + 2;
      const vtx = (i: number): [number, number, number] => [pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0, pos[i * 3 + 2] ?? 0];
      const a = vtx(i0);
      const b = vtx(i1);
      const c = vtx(i2);
      const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
      let want = area * FAR_PER_M2;
      for (let k = 0; want > 0; k++, want--) {
        const h = hash32(key, tri, k);
        if (want < 1 && (h & 0xffff) / 0x10000 >= want) break;
        let u = ((h >>> 8) & 0xfff) / 0x1000;
        let v = (hash32(h, 1) & 0xfff) / 0x1000;
        if (u + v > 1) [u, v] = [1 - u, 1 - v];
        for (let d = 0; d < 3; d++)
          out.push(
            (a[d] as number) +
              ((b[d] as number) - (a[d] as number)) * u +
              ((c[d] as number) - (a[d] as number)) * v +
              (d === 0 ? originWF.x : d === 1 ? originWF.y : originWF.z),
          );
        out.push((hash32(h, 2) & 0xffff) / 0x10000);
      }
    }
  }
  return Float32Array.from(out);
}

function createFarMaterial() {
  const right = uniform(new Vector3(1, 0, 0));
  const cam = uniform(new Vector3());
  const time = uniform(0);
  /** 지난 프레임 time(모션 벡터). */
  const prevTime = uniform(0);
  // 0 = 안 보임: 군중이 시작돼 게임이 setFarDensity를 부를 때까지(`?crowd=0`·픽셀 e2e엔 원경 사람 없음).
  const density = uniform(0);
  const ip = attribute('_ifar', 'vec4');
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  // 제자리 왕복(씨앗 방향·±2.5 m, ≈ 1.2 m/s) + 걸음 흔들림(시각 t). 모션 벡터(TAA) = 지난 프레임 시각의 같은 배치.
  const ang = ip.w.mul(6.2832);
  const baseAt = (t: TslNode<'float'>) => {
    const walk = sin(t.mul(0.48).add(ip.w.mul(40))).mul(2.5);
    return ip.xyz.add(vec3(cos(ang).mul(walk), 0, sin(ang).mul(walk)));
  };
  const base = baseAt(time);
  const at = (t: TslNode<'float'>) => {
    const base = baseAt(t);
    const bob = abs(sin(t.mul(5.8).add(ip.w.mul(17)))).mul(0.04);
    return base.add(right.mul(positionLocal.x.mul(0.55))).add(vec3(0, positionLocal.y.mul(1.7).add(bob), 0));
  };
  m.positionNode = Fn(() => {
    positionPrevious.assign(at(prevTime));
    return at(time);
  })();
  const shirt = vec3(fract(ip.w.mul(13.7)), fract(ip.w.mul(7.3)), fract(ip.w.mul(3.1)));
  // 도쿄 거리 옷: 어두운 남·검·회·베이지 위주(채도 낮게).
  const cloth = mix(vec3(0.08, 0.09, 0.11), shirt.mul(0.55).add(0.1), smoothstep(0.55, 1, fract(ip.w.mul(29.1))));
  const skin = vec3(0.72, 0.55, 0.45);
  m.colorNode = Fn(() => {
    const y = uv().y;
    // 실루엣 반폭: 머리(위 14 %)·몸(어깨 ±0.32)·다리(아래 45 %, ±0.22).
    const half = y.greaterThan(0.86).select(0.16, y.greaterThan(0.45).select(0.32, 0.22));
    Discard(abs(uv().x.sub(0.5)).greaterThan(half));
    const d = base.sub(cam).length();
    const shown = density.greaterThan(ip.w).select(1, 0);
    const fade = smoothstep(NEAR_M, NEAR_M + 30, d)
      .mul(smoothstep(FAR_M, FAR_M - 100, d))
      .mul(shown);
    const r = fract(sin(screenCoordinate.x.mul(12.9898).add(screenCoordinate.y.mul(78.233))).mul(43758.5453));
    Discard(r.greaterThanEqual(fade));
    return vec4(mix(cloth, skin, step(0.86, y)), 1);
  })();
  return { material: m, right, cam, time, prevTime, density };
}

function farGeometry(): { geo: InstancedBufferGeometry; inst: InstancedBufferAttribute } {
  const geo = new InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3),
  );
  geo.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const inst = new InstancedBufferAttribute(new Float32Array(FAR_CAPACITY * 4), 4);
  geo.setAttribute('_ifar', inst);
  geo.instanceCount = 0;
  return { geo, inst };
}

/** 카메라 (NEAR − 5) … FAR 링 안 점 → 인스턴스(렌더 좌표). 반환 = 수. */
function fillInstances(
  cells: ReadonlyMap<CellKey, Float32Array>,
  camWF: Vector3,
  o: Readonly<Vec3d>,
  a: Float32Array,
): number {
  let n = 0;
  for (const pts of cells.values())
    for (let i = 0; i < pts.length && n < FAR_CAPACITY; i += 4) {
      const dx = (pts[i] as number) - camWF.x;
      const dz = (pts[i + 2] as number) - camWF.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < (NEAR_M - 5) ** 2 || d2 > FAR_M ** 2) continue;
      a[n * 4] = (pts[i] as number) - o.x;
      a[n * 4 + 1] = (pts[i + 1] as number) - o.y;
      a[n * 4 + 2] = (pts[i + 2] as number) - o.z;
      a[n * 4 + 3] = pts[i + 3] as number;
      n++;
    }
  return n;
}

export function createFarCrowd(): FarCrowd {
  const root = new Group();
  root.name = 'far-crowd';
  const { geo, inst } = farGeometry();
  const { material, right, cam, time, prevTime, density } = createFarMaterial();
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  root.add(mesh);
  const cells = new Map<CellKey, Float32Array>();
  const last = new Vector3(Number.POSITIVE_INFINITY, 0, 0);
  const lastOrigin = { x: Number.NaN, z: Number.NaN };
  let dirty = true;
  const camWF = new Vector3();
  const fill = (o: Readonly<Vec3d>): void => {
    geo.instanceCount = fillInstances(cells, camWF, o, inst.array as Float32Array);
    inst.needsUpdate = true;
  };
  return {
    root,
    addCell(key, originWF, roads) {
      if (!roads) return;
      cells.set(key, samplePoints(key, originWF, roads));
      dirty = true;
    },
    removeCell(key) {
      if (cells.delete(key)) dirty = true;
    },
    setDensity(k) {
      density.value = Math.min(Math.max(k, 0), 1);
    },
    update(camera, o, timeS) {
      camWF.set(o.x + camera.position.x, o.y + camera.position.y, o.z + camera.position.z);
      const rebased = o.x !== lastOrigin.x || o.z !== lastOrigin.z;
      if (dirty || rebased || camWF.distanceTo(last) > REFILL_M) {
        fill(o);
        last.copy(camWF);
        lastOrigin.x = o.x;
        lastOrigin.z = o.z;
        dirty = false;
      }
      const e = camera.matrixWorld.elements;
      right.value.set(e[0] as number, 0, e[2] as number).normalize();
      cam.value.copy(camera.position);
      prevTime.value = time.value;
      time.value = timeS;
    },
    stats: () => ({ points: [...cells.values()].reduce((s, p) => s + p.length / 4, 0), drawn: geo.instanceCount }),
  };
}
