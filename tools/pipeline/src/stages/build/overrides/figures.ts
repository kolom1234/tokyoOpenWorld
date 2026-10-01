// 랜드마크 형상 생성기(M05-T05): 묘진 도리이(明神鳥居 — 휜 가사기·시마키·누키·가쿠즈카·약간 좁아지는 기둥), 앉은 아키타견 동상 + 화강암 받침.
// 치수 비율은 일반 묘진 도리이·하치코 동상 사진 기준 근사(meta.json reference). 글자·현판 문자 없음.
import type { Vec3 } from '../../../lib/triangulate.ts';
import { box, cylinder, ellipsoid, type LStream, placer, sweep } from './geom.ts';
import { LMAT, type ToriiPart } from './spec.ts';

/** 가사기 양끝 휨(m) / 길이(m). */
const SORI_PER_M = 0.028;

/**
 * 묘진 도리이: o = 중심 바닥(셀 로컬), a→b = 가사기 축(로컬 x). height = 지면 ~ 가사기 위.
 * 반환 없음 — 기둥 2·누키·가쿠즈카·시마키·가사기(휨, 9 단면 스윕).
 */
export function figureTorii(s: LStream, o: Vec3, p: ToriiPart, m: number): void {
  const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const yaw = Math.atan2(-(p.b[1] - p.a[1]), p.b[0] - p.a[0]);
  const P = placer(o, yaw);
  const D = p.pillarD;
  const kh = 0.75 * D; // 가사기 높이
  const sh = 0.55 * D; // 시마키 높이
  const pillarH = p.height - kh - sh;
  for (const k of [-1, 1]) cylinder(s, P((k * p.span) / 2, 0, 0), D / 2, D * 0.44, pillarH + 0.05, 20, m);
  // 누키(아래 가로대, 기둥 밖으로 튀어나옴)
  const nukiY = pillarH * 0.78;
  const nukiL = p.span + D * 2.6;
  sweep(s, [P(-nukiL / 2, nukiY, 0), P(nukiL / 2, nukiY, 0)], D * 0.42, D * 0.6, m);
  // 가쿠즈카(가운데 짧은 기둥)
  const gTop = pillarH;
  const gBot = nukiY + D * 0.3;
  box(s, P(0, gBot, 0), [D * 0.55, gTop - gBot, D * 0.4], yaw, m);
  // 시마키(가사기 아래 곧은 가로대)
  const shL = L * 0.88;
  sweep(s, [P(-shL / 2, pillarH + sh / 2, 0), P(shL / 2, pillarH + sh / 2, 0)], D * 0.9, sh, m);
  // 가사기(양끝이 올라가는 휨 — 2.5제곱 곡선)
  const sori = SORI_PER_M * L;
  const path: Vec3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const x = -L / 2 + (L * i) / N;
    const t = Math.abs(x) / (L / 2);
    path.push(P(x, p.height - kh / 2 - sori + sori * t ** 2.5, 0));
  }
  sweep(s, path, D * 1.15, kh, m);
}

/**
 * 받침(화강암 3단) 위 앉은 아키타견: o = 받침 바닥 중심, yaw = 로컬 −Z(코)가 보는 방향, height = 개 앉은 키(받침 위 → 귀 끝).
 * 몸 = 타원체·원기둥 조합(얼굴 표정·글자 없음).
 */
export function figureDog(s: LStream, o: Vec3, yaw: number, height: number, m: number): void {
  const stone = LMAT.stone;
  box(s, o, [1.7, 0.35, 1.15], yaw, stone);
  const P0 = placer(o, yaw);
  box(s, P0(0, 0.35, 0), [1.3, 1.0, 0.85], yaw, stone);
  box(s, P0(0, 1.35, 0), [1.42, 0.12, 0.95], yaw, stone);
  const k = height / 0.95;
  const top: Vec3 = P0(0, 1.47, 0.05);
  const P = placer(top, yaw);
  const e = (x: number, y: number, z: number, rx: number, ry: number, rz: number, pitch = 0) =>
    ellipsoid(s, P(x * k, y * k, z * k), [rx * k, ry * k, rz * k], yaw, pitch, m, 10);
  e(0, 0.2, 0.1, 0.17, 0.2, 0.22); // 엉덩이
  e(0, 0.42, -0.04, 0.15, 0.24, 0.15, -0.45); // 가슴(앉아 세운 몸)
  e(0, 0.62, -0.1, 0.085, 0.12, 0.09); // 목
  e(0, 0.76, -0.13, 0.11, 0.095, 0.115); // 머리
  e(0, 0.72, -0.25, 0.055, 0.05, 0.08); // 주둥이
  for (const sx of [-1, 1]) {
    cylinder(s, P(sx * 0.065 * k, 0, -0.14 * k), 0.035 * k, 0.03 * k, 0.42 * k, 8, m); // 앞다리
    e(sx * 0.065, 0.025, -0.18, 0.04, 0.025, 0.06); // 앞발
    e(sx * 0.13, 0.12, 0.12, 0.06, 0.12, 0.17); // 접은 뒷다리
    cylinder(s, P(sx * 0.06 * k, 0.83 * k, -0.1 * k), 0.04 * k, 0.006 * k, 0.1 * k, 6, m); // 선 귀
  }
  e(0, 0.33, 0.3, 0.05, 0.06, 0.08, 0.6); // 말린 꼬리
}
