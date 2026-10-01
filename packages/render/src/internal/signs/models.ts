// 가상 간판 단위 모델(M05-T06): 돌출 상자(袖看板, 세로 타일 양면)·입간판(A형, 세로 타일 앞뒤)·옥상 광고탑(가로 타일 앞면 + 다리).
// 원점 = 바닥 중심(돌출은 벽면), 로컬 +Z = 바깥(길 쪽, 파이프라인 yaw 규약). 정점 `_face`: 0 = 틀(금속), 1 = 세로 타일 면, 2 = 가로 타일 면.
// 면 UV = 그 면을 앞에서 볼 때 (오른쪽 +u, 아래 +v) 0..1 — 아틀라스 PNG 행 순서와 같다(flipY 없음). see ADR-0054
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three/webgpu';

/** 돌출 상자 치수(m): 두께·높이·튀어나옴, 벽 틈. 파이프라인 signs.ts SIGN_BOX_H와 같은 높이. */
export const PROJECTING = { t: 0.3, h: 2.2, d: 0.55, gap: 0.12 } as const;
/** 옥상 광고탑: scale 1 = 폭 10 m, 면 높이 = 폭 / 4(가로 타일 비), 다리 높이. */
export const BILLBOARD = { w: 10, h: 2.5, legs: 2 } as const;

type V3 = [number, number, number];

class SignBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  face: number[] = [];
  idx: number[] = [];
  /** 사각형 a→b→c→d(바깥에서 반시계), uv = 각 꼭짓점(오른쪽 +u·아래 +v). */
  quad(
    p: V3[],
    f: number,
    uv: [number, number][] = [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ): void {
    const [a, b, c] = p as [V3, V3, V3];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = new Vector3(
      (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
      (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
      (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
    ).normalize();
    const base = this.pos.length / 3;
    p.forEach((q, i) => {
      this.pos.push(...q);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(...(uv[i] as [number, number]));
      this.face.push(f);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** 축 정렬 상자(틀 면, faces = 면별 덮어쓰기: '+x' 등 → [face, uv 뒤집기]). */
  box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Record<string, number> = {},
  ): void {
    const f = (k: string): number => faces[k] ?? 0;
    // +x: 앞에서 보면 오른쪽 = −z.
    this.quad(
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      f('+x'),
    );
    // −x: 오른쪽 = +z.
    this.quad(
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      f('-x'),
    );
    this.quad(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      f('+z'),
    );
    this.quad(
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      f('-z'),
    );
    this.quad(
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      0,
    );
    this.quad(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      0,
    );
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(Float32Array.from(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(Float32Array.from(this.uv), 2));
    g.setAttribute('_face', new BufferAttribute(Float32Array.from(this.face), 1));
    g.setIndex(this.idx);
    g.boundingSphere = new Sphere(new Vector3(0, 2, 0), 8);
    return g;
  }
}

export function projectingSign(): BufferGeometry {
  const b = new SignBuilder();
  const { t, h, d, gap } = PROJECTING;
  b.box(-t / 2, t / 2, 0, h, gap, gap + d, { '+x': 1, '-x': 1 });
  for (const y of [0.25, h - 0.25]) b.box(-0.03, 0.03, y - 0.03, y + 0.03, 0, gap);
  return b.geometry();
}

export function standingSign(): BufferGeometry {
  const b = new SignBuilder();
  const [w, top, foot] = [0.36, 1.05, 0.22];
  for (const s of [1, -1]) {
    // 앞판(s = 1, +Z 쪽으로 기움)·뒤판. 앞에서 볼 때 오른쪽 = +x(앞판)·−x(뒤판).
    const [xl, xr] = s > 0 ? [-w / 2, w / 2] : [w / 2, -w / 2];
    const outer: V3[] = [
      [xl, 0.05, s * foot],
      [xr, 0.05, s * foot],
      [xr, top, 0],
      [xl, top, 0],
    ];
    b.quad(outer, 1);
    b.quad([outer[1], outer[0], outer[3], outer[2]] as V3[], 0);
  }
  return b.geometry();
}

export function rooftopSign(): BufferGeometry {
  const b = new SignBuilder();
  const { w, h, legs } = BILLBOARD;
  const [x0, x1] = [-w / 2, w / 2];
  b.box(x0, x1, legs, legs + h, -0.3, 0);
  // 앞면(가로 타일) — 틀 테두리 0.12 m 안쪽, 판 앞 1 cm.
  const r = 0.12;
  b.quad(
    [
      [x0 + r, legs + r, 0.01],
      [x1 - r, legs + r, 0.01],
      [x1 - r, legs + h - r, 0.01],
      [x0 + r, legs + h - r, 0.01],
    ],
    2,
  );
  for (const x of [x0 + 0.6, 0, x1 - 0.6]) {
    b.box(x - 0.08, x + 0.08, 0, legs, -0.25, -0.09);
    b.box(x - 0.08, x + 0.08, 0, legs, -1.6, -1.44);
  }
  b.box(x0 + 0.4, x1 - 0.4, legs * 0.5 - 0.06, legs * 0.5 + 0.06, -1.6, -0.09);
  return b.geometry();
}
