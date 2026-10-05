// 차량 절차 모델 조립기(M06-T06, 자체 제작 — ADR-0066): 육면체(사다리꼴 상자)·상자·바퀴(축 x 원기둥 + 휠 살) → BufferGeometry
// (위치·법선 f32, 정점색 f32 선형, `_vpart` vec4 = 부품 코드·바퀴 축 z·축 y·0). 원점 = 바닥 중심, 로컬 −Z = 전방, +X = 오른쪽(전방 볼 때).
import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three/webgpu';

/** 부품 코드(셰이더 `_vpart.x`) — 도장·유리·바퀴 회전·등화 발광을 고른다. */
export const VPART = {
  fixed: 0,
  paint: 1,
  glass: 2,
  wheel: 3,
  head: 4,
  tail: 5,
  blinkL: 6,
  blinkR: 7,
  roofLamp: 8,
  accent: 9,
  /** 열차(M07-T03 — trains/models.ts): 문짝(`_vpart.y` = 미닫이 방향 ±1, `.z` = 쪽 ±1)·차내 안내 화면·실내등·스테인리스 차체. */
  doorLeaf: 10,
  lcd: 11,
  cabinLight: 12,
  stainless: 13,
} as const;
export type VPart = (typeof VPART)[keyof typeof VPART];

type P3 = readonly [number, number, number];
/** 육면체 꼭짓점: c(ix, iy, iz) — ix 0 = −X·1 = +X, iy 0 = 아래·1 = 위, iz 0 = −Z(앞)·1 = +Z(뒤). */
export type Corner = (ix: 0 | 1, iy: 0 | 1, iz: 0 | 1) => P3;

/** 상자 면 6개(바깥에서 반시계) — props/geo.ts PartBuilder.box와 같은 순서. */
const FACES: readonly (readonly [0 | 1, 0 | 1, 0 | 1][])[] = [
  [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
  [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
];

export class VehicleBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly part: number[] = [];
  readonly idx: number[] = [];
  private readonly c = new Color();

  private vert(p: P3, n: P3, code: number, axle: readonly [number, number]): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.part.push(code, axle[0], axle[1], 0);
    return this.pos.length / 3 - 1;
  }

  /** 볼록 사각형 a→b→c→d(바깥에서 반시계), 법선 = 대각선 외적. */
  private quad(a: P3, b: P3, c: P3, d: P3, code: number, axle: readonly [number, number] = [0, 0]): void {
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const n: [number, number, number] = [
      (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
      (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
      (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
    ];
    const l = Math.hypot(...n) || 1;
    const nn: P3 = [n[0] / l, n[1] / l, n[2] / l];
    const i = this.vert(a, nn, code, axle);
    this.vert(b, nn, code, axle);
    this.vert(c, nn, code, axle);
    this.vert(d, nn, code, axle);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** 육면체(면 6개, 평면 법선). skipBottom = 바닥면 생략(보이지 않음). extra = `_vpart.yz`(바퀴 축·문짝 방향). */
  hexa(corner: Corner, hex: number, code: VPart, skipBottom = true, extra: readonly [number, number] = [0, 0]): this {
    this.c.setHex(hex);
    FACES.forEach((f, k) => {
      if (skipBottom && k === 5) return;
      const [a, b, c, d] = f.map(([x, y, z]) => corner(x, y, z)) as [P3, P3, P3, P3];
      this.quad(a, b, c, d, code, extra);
    });
    return this;
  }

  /** 사다리꼴 상자: 높이 y0..y1, 아래 z 범위 zb, 위 z 범위 zt, 반폭 아래 wb·위 wt(가운데 x = 0). */
  taper(
    y0: number,
    y1: number,
    zb: readonly [number, number],
    zt: readonly [number, number],
    wb: number,
    wt: number,
    hex: number,
    code: VPart,
  ): this {
    return this.hexa((ix, iy, iz) => [(ix ? 1 : -1) * (iy ? wt : wb), iy ? y1 : y0, (iy ? zt : zb)[iz]], hex, code);
  }

  /** 축 정렬 상자: 중심·크기. */
  box(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    hex: number,
    code: VPart,
    extra: readonly [number, number] = [0, 0],
  ): this {
    return this.hexa(
      (ix, iy, iz) => [cx + (ix - 0.5) * sx, cy + (iy - 0.5) * sy, cz + (iz - 0.5) * sz],
      hex,
      code,
      false,
      extra,
    );
  }

  /** 바퀴: x = 바깥 면 중심(부호 = 쪽), 축 (y = r, z), 폭 w, 옆면 seg. 살(spoke) = 휠 면 위 막대 — 회전이 보이게(LOD0). */
  wheel(x: number, r: number, z: number, w: number, seg: number, spokes: number): this {
    const side = Math.sign(x) || 1;
    const axle: [number, number] = [z, r];
    const at = (a: number, rad: number, dx: number): P3 => [x + dx, r + Math.sin(a) * rad, z + Math.cos(a) * rad];
    this.c.setHex(0x1b1b1c);
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 2 * Math.PI;
      const a1 = ((k + 1) / seg) * 2 * Math.PI;
      // 바깥에서 반시계: 안쪽 면(−side·w)과 바깥 면(0) 사이 띠.
      const [i0, o0, i1, o1] = [at(a0, r, -side * w), at(a0, r, 0), at(a1, r, -side * w), at(a1, r, 0)];
      if (side > 0) this.quad(o0, o1, i1, i0, VPART.wheel, axle);
      else this.quad(i0, i1, o1, o0, VPART.wheel, axle);
    }
    // 바깥 휠 면(부채꼴): 림 은색, 중심 = 축.
    this.c.setHex(0x9ea3a8);
    const n: P3 = [side, 0, 0];
    const ci = this.vert([x + side * 0.005, r, z], n, VPART.wheel, axle);
    for (let k = 0; k <= seg; k++) this.vert(at((k / seg) * 2 * Math.PI, r * 0.62, side * 0.005), n, VPART.wheel, axle);
    for (let k = 0; k < seg; k++) {
      if (side > 0) this.idx.push(ci, ci + 2 + k, ci + 1 + k);
      else this.idx.push(ci, ci + 1 + k, ci + 2 + k);
    }
    this.c.setHex(0x2c2e30);
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * 2 * Math.PI;
      const [p0, p1] = [at(a - 0.12, r * 0.18, side * 0.012), at(a + 0.12, r * 0.18, side * 0.012)];
      const [p2, p3] = [at(a + 0.08, r * 0.58, side * 0.012), at(a - 0.08, r * 0.58, side * 0.012)];
      if (side > 0) this.quad(p0, p1, p2, p3, VPART.wheel, axle);
      else this.quad(p0, p3, p2, p1, VPART.wheel, axle);
    }
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(Float32Array.from(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(Float32Array.from(this.col), 3));
    g.setAttribute('_vpart', new BufferAttribute(Float32Array.from(this.part), 4));
    g.setIndex(this.pos.length / 3 > 65535 ? new BufferAttribute(Uint32Array.from(this.idx), 1) : this.idx.slice());
    g.computeBoundingBox();
    g.boundingSphere = g.boundingBox?.getBoundingSphere(new Sphere()) ?? new Sphere(new Vector3(), 1);
    return g;
  }

  get triangles(): number {
    return this.idx.length / 3;
  }
}
