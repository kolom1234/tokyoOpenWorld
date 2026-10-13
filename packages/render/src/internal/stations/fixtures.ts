// 역 시설(M07-T06 — ADR-0081): 개찰구 캐비닛·윗판·울타리·계단 표식(인스턴스 상자, 팔레트 색) + 개찰구 플랩(열림 0..1 — 캐비닛 쪽으로 접힘).
// 위치 = WF(인스턴스 행렬) · 묶음 = −렌더 원점(원점 재설정 때 sync). 실제 기기 모양·로고 없음(가상). 글자 안내판 = signs.ts(가상 디자인).
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  type Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { StationFixtures } from '../../api.ts';
import { buildSignMesh } from './signs.ts';

/** 색(선형 sRGB 근사): 캐비닛 스테인리스·윗판 짙은 회색·플랩 반투명 대신 연한 하늘색·울타리·안내판 파랑·바닥 판·노란 테두리. */
const PALETTE = [0xb8bcc0, 0x2b2f33, 0xcfe6f2, 0x8f969c, 0x1f4f9a, 0x3a3d40, 0xe2b72c].map((h) => new Color(h));
const BOX_STRIDE = 8;
const FLAP_STRIDE = 8;
/** 열림 1에서 남는 폭 비율. */
const FLAP_MIN = 0.12;

export interface StationFixtureLayer {
  readonly root: Group;
  set(f: StationFixtures | null): void;
  setFlaps(open: Float32Array): void;
  sync(renderOriginWF: { x: number; y: number; z: number }): void;
  stats(): { boxes: number; flaps: number; signs: number };
  dispose(): void;
}

const m4 = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const pos = new Vector3();
const scl = new Vector3();

function mesh(cap: number, name: string, roughness: number, metalness: number): InstancedMesh {
  const m = new InstancedMesh(
    new BoxGeometry(2, 2, 2),
    new MeshStandardNodeMaterial({ roughness, metalness }),
    Math.max(1, cap),
  );
  m.name = name;
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 상자(cx,cy,cz,hx,hy,hz,yaw,색 × n) → 인스턴스 메시. */
function boxMesh(data: Float64Array): InstancedMesh {
  const nb = data.length / BOX_STRIDE;
  const boxes = mesh(nb, 'stations/boxes', 0.45, 0.35);
  for (let i = 0; i < nb; i++) {
    const d = data.subarray(i * BOX_STRIDE, (i + 1) * BOX_STRIDE);
    pos.set(d[0] as number, d[1] as number, d[2] as number);
    scl.set(d[3] as number, d[4] as number, d[5] as number);
    boxes.setMatrixAt(i, m4.compose(pos, q.setFromAxisAngle(up, d[6] as number), scl));
    boxes.setColorAt(i, PALETTE[d[7] as number] ?? (PALETTE[0] as Color));
  }
  boxes.count = nb;
  return boxes;
}

function disposeMesh(root: Group, m: Mesh): void {
  root.remove(m);
  m.geometry.dispose();
  const mat = m.material as MeshStandardNodeMaterial;
  mat.map?.dispose();
  mat.dispose();
}

export function createStationFixtures(): StationFixtureLayer {
  const root = new Group();
  root.name = 'stations';
  let boxes: InstancedMesh | null = null;
  let flaps: InstancedMesh | null = null;
  let signs: Mesh | null = null;
  let signCount = 0;
  let flapData = new Float64Array(0);
  const clear = () => {
    for (const m of [boxes, flaps, signs]) if (m) disposeMesh(root, m);
    boxes = flaps = signs = null;
  };
  const writeFlaps = (open: Float32Array) => {
    if (!flaps) return;
    const n = flapData.length / FLAP_STRIDE;
    for (let i = 0; i < n; i++) {
      const d = flapData.subarray(i * FLAP_STRIDE, (i + 1) * FLAP_STRIDE);
      const o = Math.min(Math.max(open[i >> 1] ?? 0, 0), 1);
      const k = 1 - (1 - FLAP_MIN) * o;
      const yaw = d[6] as number;
      // 접힘: 폭 k배, 중심을 바깥(side 쪽 캐비닛)으로 hx(1 − k)만큼.
      const shift = (d[7] as number) * (d[3] as number) * (1 - k);
      pos.set((d[0] as number) + Math.cos(yaw) * shift, d[1] as number, (d[2] as number) - Math.sin(yaw) * shift);
      scl.set((d[3] as number) * k, d[4] as number, d[5] as number);
      flaps.setMatrixAt(i, m4.compose(pos, q.setFromAxisAngle(up, yaw), scl));
    }
    flaps.instanceMatrix.needsUpdate = true;
  };
  return {
    root,
    set(f) {
      clear();
      if (!f) return;
      boxes = boxMesh(f.boxes);
      root.add(boxes);
      flapData = Float64Array.from(f.flaps);
      flaps = mesh(flapData.length / FLAP_STRIDE, 'stations/flaps', 0.3, 0);
      flaps.count = flapData.length / FLAP_STRIDE;
      for (let i = 0; i < flaps.count; i++) flaps.setColorAt(i, PALETTE[2] as Color);
      writeFlaps(new Float32Array(flaps.count));
      root.add(flaps);
      signs = buildSignMesh(f.signs ?? []);
      signCount = signs ? (f.signs?.length ?? 0) : 0;
      if (signs) root.add(signs);
    },
    setFlaps: writeFlaps,
    sync(o) {
      root.position.set(-o.x, -o.y, -o.z);
    },
    stats: () => ({ boxes: boxes?.count ?? 0, flaps: flaps?.count ?? 0, signs: signCount }),
    dispose: clear,
  };
}
