// 역 안내판(M07-T06 후속): StationSign[] → 글자 아틀라스 1장(OffscreenCanvas, 판당 1024×256) + 앞뒤 사각형 묶음 메시 1개(머티리얼 1개 — 선컴파일 부담 없음).
// 가상 디자인: 남색 판·주황 그림 기호(개찰구·계단·출구·역 — 단순 도형)·시스템 sans-serif. 실제 철도사 로고·서체·색 띠 복제 없음. 조명 없는 발광면(밤에도 읽힘).
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicNodeMaterial,
  SRGBColorSpace,
} from 'three/webgpu';
import type { StationSign } from '../../api.ts';

const CW = 1024;
const CH = 256;
const BG = '#14324f';
const ACCENT = '#f08a24';
const FONT = 'system-ui, "Noto Sans JP", "Noto Sans KR", "Malgun Gothic", "Yu Gothic", sans-serif';

type Ctx = OffscreenCanvasRenderingContext2D;

function icon(c: Ctx, kind: StationSign['icon'], x: number, y: number, s: number): void {
  c.fillStyle = ACCENT;
  c.fillRect(x, y, s, s);
  c.strokeStyle = c.fillStyle = '#fff';
  c.lineWidth = s * 0.07;
  c.lineCap = c.lineJoin = 'round';
  const p = (fx: number, fy: number): [number, number] => [x + fx * s, y + fy * s];
  const line = (...pts: [number, number][]) => {
    c.beginPath();
    pts.forEach(([px, py], i) => {
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.stroke();
  };
  if (kind === 'gate') {
    // 캐비닛 두 개 + 가운데로 지나가는 화살표.
    c.fillRect(...p(0.18, 0.3), s * 0.12, s * 0.5);
    c.fillRect(...p(0.7, 0.3), s * 0.12, s * 0.5);
    line(p(0.5, 0.82), p(0.5, 0.2));
    line(p(0.36, 0.34), p(0.5, 0.2), p(0.64, 0.34));
  } else if (kind === 'stairs') {
    line(
      p(0.15, 0.8),
      p(0.35, 0.8),
      p(0.35, 0.62),
      p(0.55, 0.62),
      p(0.55, 0.44),
      p(0.75, 0.44),
      p(0.75, 0.26),
      p(0.88, 0.26),
    );
  } else if (kind === 'exit') {
    c.strokeRect(...p(0.18, 0.2), s * 0.38, s * 0.62);
    line(p(0.42, 0.51), p(0.86, 0.51));
    line(p(0.72, 0.37), p(0.86, 0.51), p(0.72, 0.65));
  } else {
    // 역: 단순 차량 정면(둥근 사각 + 창 + 바퀴 두 점).
    c.strokeRect(...p(0.22, 0.16), s * 0.56, s * 0.58);
    c.fillRect(...p(0.3, 0.26), s * 0.4, s * 0.18);
    c.beginPath();
    c.arc(...p(0.34, 0.86), s * 0.06, 0, Math.PI * 2);
    c.arc(...p(0.66, 0.86), s * 0.06, 0, Math.PI * 2);
    c.fill();
  }
}

/** 판 하나를 (0, row·CH)에 그린다. 글이 넘치면 줄여 맞춘다. */
function drawSign(c: Ctx, s: StationSign, row: number): void {
  const y = row * CH;
  c.fillStyle = BG;
  c.fillRect(0, y, CW, CH);
  c.fillStyle = ACCENT;
  c.fillRect(0, y + CH - 12, CW, 12);
  icon(c, s.icon, 24, y + 24, CH - 60);
  const left = CH + 4;
  const fit = (text: string, px: number, weight: number) => {
    let size = px;
    c.font = `${weight} ${size}px ${FONT}`;
    while (size > 20 && c.measureText(text).width > CW - left - 28) {
      size -= 4;
      c.font = `${weight} ${size}px ${FONT}`;
    }
  };
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffffff';
  fit(s.title, 92, 700);
  c.fillText(s.title, left, y + 118);
  c.fillStyle = '#cfe0f0';
  fit(s.sub, 50, 500);
  c.fillText(s.sub, left, y + 196);
}

/** 아틀라스 + 판마다 앞뒤 사각형(뒤는 u 뒤집어 글이 바로 읽힌다). OffscreenCanvas 없으면(Node 테스트) null. */
export function buildSignMesh(signs: readonly StationSign[]): Mesh | null {
  if (signs.length === 0 || typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(CW, CH * signs.length);
  const c = canvas.getContext('2d');
  if (!c) return null;
  for (const [i, s] of signs.entries()) drawSign(c, s, i);
  const pos = new Float32Array(signs.length * 8 * 3);
  const uv = new Float32Array(signs.length * 8 * 2);
  const idx = new Uint32Array(signs.length * 12);
  for (const [i, s] of signs.entries()) quads(s, i, signs.length, pos, uv, idx);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new Mesh(g, new MeshBasicNodeMaterial({ map: tex }));
  m.name = 'stations/signs';
  m.frustumCulled = false;
  return m;
}

/** 판 i: 앞면(법선 = 앞 방향, 판 앞 0.025 m)·뒷면(반대, 뒤 0.025 m). */
function quads(s: StationSign, i: number, n: number, pos: Float32Array, uv: Float32Array, idx: Uint32Array): void {
  const f = { x: -Math.sin(s.yawRad), z: -Math.cos(s.yawRad) };
  // r = yaw의 오른쪽. 앞면을 읽는 사람(+f 쪽에서 −f를 봄)의 왼쪽 = +r, 뒷면을 읽는 사람의 왼쪽 = −r.
  const r = { x: Math.cos(s.yawRad), z: -Math.sin(s.yawRad) };
  const [cx, cy, cz] = s.posWF;
  const hw = s.widthM / 2;
  const hh = s.heightM / 2;
  const v0 = 1 - (i + 1) / n;
  const v1 = 1 - i / n;
  for (const side of [1, -1]) {
    const o = (i * 2 + (side === 1 ? 0 : 1)) * 4;
    const d = 0.025 * side;
    const L = { x: r.x * side, z: r.z * side };
    const corners: [number, number, number, number][] = [
      [-1, -1, 0, v0],
      [1, -1, 1, v0],
      [1, 1, 1, v1],
      [-1, 1, 0, v1],
    ];
    corners.forEach(([sx, sy, u, v], k) => {
      // sx = −1 → 보는 사람 왼쪽(+L), +1 → 오른쪽(−L).
      pos.set([cx - L.x * hw * sx + f.x * d, cy + hh * sy, cz - L.z * hw * sx + f.z * d], (o + k) * 3);
      uv.set([u, v], (o + k) * 2);
    });
    // 읽는 사람 쪽에서 반시계(왼아래 → 오른아래 → 오른위 → 왼위).
    const base = (i * 2 + (side === 1 ? 0 : 1)) * 6;
    idx.set([o, o + 1, o + 2, o, o + 2, o + 3], base);
  }
}
