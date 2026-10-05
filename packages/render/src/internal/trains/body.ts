// 열차 차체(M07-T03, ADR-0072): LOD0 = 창이 뚫린 벽(얇은 상자 — 안팎 모두 보임)·미닫이 문짝(`_vpart.y` 방향·`.z` 쪽)·끝벽·운전실 칸막이 + 차내
// (바닥·천장·실내등·롱시트·칸막이 판·손잡이 기둥·선반·문 위 안내 화면). LOD1–2 = 막힌 상자 + 어두운 유리 띠(창 구멍 없음).
// 탑승(M07-T05)·전면 전망은 LOD0(45 m 안)만 쓴다 — 칸 안 카메라는 늘 LOD0.
import { type VehicleBuilder as B, VPART } from '../vehicles/builder.ts';
import { bodyEnd, C, type CarDims, type CarLod } from './parts.ts';

const T = 0.06;
const IN = {
  floor: 0x8a8577,
  ceiling: 0xe9ebe8,
  seat: 0x44507a,
  panel: 0xd9dcd6,
  pole: 0xb9bec4,
  lcd: 0x0d1a2a,
  light: 0xfffaf0,
  console: 0x2a2c30,
} as const;

/** 칸 길이 방향 벽 구간(문 사이·끝): [z0, z1] 목록. cabEnd = 운전실 쪽(−1 앞·+1 뒤·0 없음) — 운전실 구간은 따로. */
export function wallSpans(d: CarDims, cabEnds: readonly number[]): [number, number][] {
  const e = bodyEnd(d);
  const lo = cabEnds.includes(-1) ? -e + d.cab : -e;
  const hi = cabEnds.includes(1) ? e - d.cab : e;
  const cuts = d.doors.map((z) => [z - d.doorW / 2, z + d.doorW / 2] as const);
  const out: [number, number][] = [];
  let z = lo;
  for (const [a, b] of cuts) {
    if (a > z + 0.05) out.push([z, Math.min(a, hi)]);
    z = Math.max(z, b);
  }
  if (hi > z + 0.05) out.push([z, hi]);
  return out;
}

/** 한쪽 벽 구간 하나: 아래 벽·창 기둥(창 ≤ 1.9 m마다)·위 벽. LOD0 = 창 구멍, 그 밖 = 어두운 유리. */
function wallSpan(b: B, d: CarDims, s: number, z0: number, z1: number, lod: CarLod): void {
  const x = s * (d.W / 2 - T / 2);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  b.box(x, (d.skirt + d.belt) / 2, zc, T, d.belt - d.skirt, len, C.stainless, VPART.stainless);
  b.box(x, (d.winTop + d.cornice) / 2, zc, T, d.cornice - d.winTop, len, C.stainless, VPART.stainless);
  // 노선색 띠(창 아래 — 문에서 끊긴다, 셰이더 인스턴스 색).
  b.box(s * (d.W / 2 + 0.006), d.belt - 0.09, zc, 0.012, 0.12, len, 0xffffff, VPART.paint);
  const band = d.winTop - d.belt;
  if (lod > 0) {
    b.box(s * (d.W / 2 + 0.004), (d.belt + d.winTop) / 2, zc, 0.02, band, len - 0.2, C.glass, VPART.glass);
    return;
  }
  const n = Math.max(1, Math.round(len / 1.9));
  const posts = [z0, z1, ...Array.from({ length: n - 1 }, (_, k) => z0 + ((k + 1) * len) / n)];
  for (const z of posts) {
    const w = z === z0 || z === z1 ? 0.24 : 0.14;
    const cz = z === z0 ? z + w / 2 : z === z1 ? z - w / 2 : z;
    b.box(x, (d.belt + d.winTop) / 2, cz, T, band, w, C.stainless, VPART.stainless);
  }
}

/** 문 하나(한쪽): 위 벽 + 문짝 2장(아래 판·유리·위 판 — 모두 doorLeaf라 함께 미닫이). */
function door(b: B, d: CarDims, s: number, z: number, lod: CarLod): void {
  const x = s * (d.W / 2 - T / 2);
  b.box(x, (d.doorTop + d.cornice) / 2, z, T, d.cornice - d.doorTop, d.doorW, C.stainless, VPART.stainless);
  b.box(x, (d.skirt + d.floor) / 2, z, T, d.floor - d.skirt, d.doorW, C.stainless, VPART.stainless);
  const lx = s * (d.W / 2 - T - 0.025);
  const half = d.doorW / 2;
  for (const dir of [-1, 1]) {
    const cz = z + (dir * half) / 2;
    const ex: [number, number] = [dir, s];
    const gTop = d.winTop - 0.05;
    const gBot = d.belt + 0.1;
    if (lod === 2) {
      b.box(lx, (d.floor + d.doorTop) / 2, cz, 0.04, d.doorTop - d.floor, half - 0.02, C.stainless, VPART.doorLeaf, ex);
      continue;
    }
    b.box(lx, (d.floor + gBot) / 2, cz, 0.04, gBot - d.floor, half - 0.02, C.stainless, VPART.doorLeaf, ex);
    b.box(lx, (gBot + gTop) / 2, cz, 0.035, gTop - gBot, half - 0.02, C.glass, VPART.doorLeaf, ex);
    b.box(lx, (gTop + d.doorTop) / 2, cz, 0.04, d.doorTop - gTop, half - 0.02, C.stainless, VPART.doorLeaf, ex);
  }
}

/** 운전실 옆(창 하나) — 문 없는 구간으로. */
function cabSide(b: B, d: CarDims, end: number, lod: CarLod): void {
  const e = bodyEnd(d);
  const [z0, z1] = end < 0 ? [-e, -e + d.cab] : [e - d.cab, e];
  for (const s of [-1, 1]) wallSpan(b, d, s, z0, z1, lod);
}

/** 연결 끝벽(운전실 아닌 끝): 막힌 벽 + 통로문 유리 + 바깥 주름막. */
function gangwayEnd(b: B, d: CarDims, end: number): void {
  const z = end * (bodyEnd(d) - T / 2);
  b.box(0, (d.skirt + d.cornice) / 2, z, d.W - 0.02, d.cornice - d.skirt, T, C.stainless, VPART.stainless);
  b.box(0, (d.belt + d.winTop) / 2, z + end * 0.035, 0.55, d.winTop - d.belt, 0.02, C.glass, VPART.glass);
  b.box(
    0,
    (d.floor + d.doorTop) / 2,
    end * (d.L / 2 - 0.125),
    1.1,
    d.doorTop - d.floor + 0.1,
    0.25,
    C.bellows,
    VPART.fixed,
  );
}

/** 운전실 칸막이(차내 쪽, 가운데 창 구멍) + 운전대(왼쪽). */
function cabPartition(b: B, d: CarDims, end: number): void {
  const z = end * (bodyEnd(d) - d.cab);
  const w = d.W - 2 * T;
  b.box(0, (d.floor + d.belt) / 2, z, w, d.belt - d.floor, 0.05, IN.panel, VPART.fixed);
  b.box(0, (d.winTop + d.cornice) / 2, z, w, d.cornice - d.winTop, 0.05, IN.panel, VPART.fixed);
  for (const s of [-1, 1])
    b.box(s * (w / 2 - 0.3), (d.belt + d.winTop) / 2, z, 0.6, d.winTop - d.belt, 0.05, IN.panel, VPART.fixed);
  const zc = end * (bodyEnd(d) - 0.55);
  b.box(-0.55, d.floor + 0.45, zc, 1.1, 0.9, 0.6, IN.console, VPART.fixed);
}

/** 차내: 바닥·천장·실내등·문 위 화면. */
function cabin(b: B, d: CarDims): void {
  const e = bodyEnd(d) - T;
  const w = d.W - 2 * T;
  b.box(0, d.floor - 0.03, 0, w, 0.06, 2 * e, IN.floor, VPART.fixed);
  b.box(0, d.cornice - 0.07, 0, w, 0.05, 2 * e, IN.ceiling, VPART.fixed);
  for (const x of [-0.55, 0.55]) b.box(x, d.cornice - 0.1, 0, 0.12, 0.02, 2 * e - 1.4, IN.light, VPART.cabinLight);
  for (const z of d.doors)
    for (const s of [-1, 1]) b.box(s * (w / 2 - 0.03), d.doorTop + 0.12, z, 0.05, 0.18, 0.62, IN.lcd, VPART.lcd);
}

/** 롱시트(벽 구간마다): 방석·등받이·양끝 칸막이 판·기둥·선반·손잡이 봉. */
function seats(b: B, d: CarDims, spans: readonly [number, number][]): void {
  const w = d.W - 2 * T;
  for (const [z0, z1] of spans)
    for (const s of [-1, 1]) {
      const len = z1 - z0 - 0.1;
      if (len < 0.9) continue;
      const zc = (z0 + z1) / 2;
      b.box(s * (w / 2 - 0.27), d.floor + 0.41, zc, 0.5, 0.08, len, IN.seat, VPART.fixed);
      b.box(s * (w / 2 - 0.29), d.floor + 0.2, zc, 0.42, 0.36, len, IN.panel, VPART.fixed);
      b.box(s * (w / 2 - 0.05), d.floor + 0.72, zc, 0.1, 0.55, len, IN.seat, VPART.fixed);
      for (const z of [z0 + 0.04, z1 - 0.04])
        b.box(s * (w / 2 - 0.3), d.floor + 0.55, z, 0.6, 1.1, 0.04, IN.panel, VPART.fixed);
      if (len > 2.5)
        b.box(
          s * (w / 2 - 0.62),
          (d.floor + d.cornice) / 2,
          zc,
          0.035,
          d.cornice - d.floor - 0.1,
          0.035,
          IN.pole,
          VPART.fixed,
        );
      b.box(s * (w / 2 - 0.16), d.winTop - 0.1, zc, 0.3, 0.03, len, IN.pole, VPART.fixed);
      b.box(s * (w / 2 - 0.55), d.winTop + 0.02, zc, 0.03, 0.03, len, IN.pole, VPART.fixed);
    }
}

/** 차체 전부(벽·문·끝·차내). cabEnds = 운전실 끝(−1 앞·+1 뒤). */
export function carBody(b: B, d: CarDims, cabEnds: readonly number[], lod: CarLod): void {
  const spans = wallSpans(d, cabEnds);
  for (const s of [-1, 1]) {
    for (const [z0, z1] of spans) wallSpan(b, d, s, z0, z1, lod);
    for (const z of d.doors) door(b, d, s, z, lod);
  }
  for (const end of [-1, 1]) {
    if (cabEnds.includes(end)) {
      cabSide(b, d, end, lod);
      if (lod === 0) cabPartition(b, d, end);
    } else gangwayEnd(b, d, end);
  }
  if (lod === 0) {
    cabin(b, d);
    seats(b, d, spans);
  } else b.box(0, (d.skirt + d.floor) / 2, 0, d.W - 0.1, d.floor - d.skirt, 2 * bodyEnd(d) - 0.1, C.under, VPART.fixed);
}
