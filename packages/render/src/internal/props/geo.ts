// 소품 절차 모델 조립기(M05-T03): 상자·원기둥(축 x/y/z)·삼각 기둥 → 정점색 BufferGeometry(위치·법선 f32, 색 f32 선형).
// 원점 = 바닥 중심, 로컬 +Z = 정면(파이프라인 yaw 규약, ADR-0051). 색은 sRGB hex → 선형(Color). see docs/07-rendering.md §5
import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three/webgpu';

type Axis = 'x' | 'y' | 'z';

export class PartBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];
  private readonly c = new Color();

  private vert(p: readonly number[], n: readonly number[]): number {
    this.pos.push(p[0] as number, p[1] as number, p[2] as number);
    this.nrm.push(n[0] as number, n[1] as number, n[2] as number);
    this.col.push(this.c.r, this.c.g, this.c.b);
    return this.pos.length / 3 - 1;
  }

  /** 볼록 사각형(반시계 = 바깥에서 볼 때). */
  private quad(a: number[], b: number[], c: number[], d: number[], n: readonly number[]): void {
    const i = this.vert(a, n);
    this.vert(b, n);
    this.vert(c, n);
    this.vert(d, n);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** 축 정렬 상자: 중심(cx, cy, cz)·크기(sx, sy, sz). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number): this {
    this.c.setHex(hex);
    const [x0, x1, y0, y1, z0, z1] = [cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    return this;
  }

  /**
   * 원기둥(원뿔대): 축 방향 axis, 바닥 중심 (cx, cy, cz)에서 길이 h, 반지름 r0 → r1, 옆면 seg, 윗뚜껑만(아래는 보통 땅·벽에 붙음).
   * 축 x·z = 눕힌 원기둥(파이프·원판).
   */
  cyl(
    cx: number,
    cy: number,
    cz: number,
    r0: number,
    r1: number,
    h: number,
    seg: number,
    hex: number,
    axis: Axis = 'y',
  ): this {
    this.c.setHex(hex);
    // 로컬(u, 축 t, v) → 월드(회전 — 행렬식 +1이라 감기 유지): y축 = (u, t, v), x축 = (t, u, −v), z축 = (u, −v, t).
    const dir = (u: number, t: number, v: number): number[] =>
      axis === 'y' ? [u, t, v] : axis === 'x' ? [t, u, -v] : [u, -v, t];
    const map = (u: number, t: number, v: number): number[] => {
      const d = dir(u, t, v);
      return [cx + (d[0] as number), cy + (d[1] as number), cz + (d[2] as number)];
    };
    const slope = (r0 - r1) / h;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 2 * Math.PI;
      const a1 = ((k + 1) / seg) * 2 * Math.PI;
      const am = (a0 + a1) / 2;
      const n = dir(Math.cos(am), slope, Math.sin(am));
      const l = Math.hypot(n[0] as number, n[1] as number, n[2] as number);
      const nn = n.map((x) => x / l);
      // 바깥에서 본 반시계: 아래 a1 → 아래 a0 → 위 a0 → 위 a1(u = cos, v = sin 이 오른손계에서 시계라 a1부터).
      this.quad(
        map(Math.cos(a1) * r0, 0, Math.sin(a1) * r0),
        map(Math.cos(a0) * r0, 0, Math.sin(a0) * r0),
        map(Math.cos(a0) * r1, h, Math.sin(a0) * r1),
        map(Math.cos(a1) * r1, h, Math.sin(a1) * r1),
        nn,
      );
    }
    const top = dir(0, 1, 0);
    const ci = this.vert(map(0, h, 0), top);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * 2 * Math.PI;
      this.vert(map(Math.cos(a) * r1, h, Math.sin(a) * r1), top);
    }
    for (let k = 0; k < seg; k++) this.idx.push(ci, ci + 2 + k, ci + 1 + k);
    return this;
  }

  /** 역삼각형 판(정지 표지): 중심 (cx, cy), 앞면 z = cz, 한 변 w, 두께 t. */
  invTriangle(cx: number, cy: number, cz: number, w: number, t: number, hex: number): this {
    this.c.setHex(hex);
    const h = (w * Math.sqrt(3)) / 2;
    const p = [
      [cx - w / 2, cy + h / 3],
      [cx + w / 2, cy + h / 3],
      [cx, cy - (2 * h) / 3],
    ] as const;
    for (const [z, nz] of [
      [cz, 1],
      [cz - t, -1],
    ] as const) {
      const i = this.pos.length / 3;
      for (const q of nz > 0 ? [p[0], p[2], p[1]] : [p[0], p[1], p[2]]) this.vert([q[0], q[1], z], [0, 0, nz]);
      this.idx.push(i, i + 1, i + 2);
    }
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(Float32Array.from(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(Float32Array.from(this.col), 3));
    g.setIndex(this.idx.slice());
    g.computeBoundingBox();
    g.boundingSphere = g.boundingBox?.getBoundingSphere(new Sphere()) ?? new Sphere(new Vector3(), 1);
    return g;
  }

  get triangles(): number {
    return this.idx.length / 3;
  }
}
