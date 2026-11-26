// 절차 파사드 벽 재질 선택 표(07 §5-3) — 렌더 셰이더(materials/facade/walls.ts)와 파이프라인(실측 색 → tintIdx 고르기, M12-T06)이 같은 값을 쓴다.
// 레이어 선택은 TSL `hash`(PCG — three Hash.js)로 하므로 CPU 짝 `tslHash`도 여기 둔다(셰이더 hash(float)는 uint로 자르므로 trunc).

/** 클래스별 벽 그룹 후보 4개(tintIdx 해시로 선택) — 순서 = FACADE_CLASS(오피스·맨션·주택·상업·공공·공업). 같은 그룹 반복 = 가중치. */
export const FACADE_WALL_CHOICES: readonly (readonly string[])[] = [
  ['tile', 'concrete', 'metal', 'alc'],
  ['tile', 'tile', 'plaster', 'concrete'],
  ['siding', 'plaster', 'siding', 'tile'],
  ['tile', 'metal', 'plaster', 'concrete'],
  ['concrete', 'tile', 'concrete', 'alc'],
  ['metal', 'alc', 'metal', 'concrete'],
];

/** 틴트 팔레트(선형 배수) 8색 — 도쿄 거리의 흰·베이지·회색·갈색 계열. tintIdx mod 8로 고른다. */
export const FACADE_PALETTE: readonly (readonly [number, number, number])[] = [
  [1.05, 1.03, 1.0],
  [1.0, 0.95, 0.86],
  [0.9, 0.9, 0.92],
  [0.98, 0.88, 0.76],
  [0.78, 0.72, 0.66],
  [1.02, 1.0, 0.95],
  [0.86, 0.9, 0.95],
  [0.95, 0.92, 0.9],
];

/** three TSL `hash`(PCG — Hash.js)와 같은 값(0..1). 셰이더 hash(x)는 uint(x)로 자르므로 정수부만 쓴다. */
export function tslHash(seed: number): number {
  const state = (Math.imul(Math.trunc(seed) >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 2 ** 32;
}

/** 셰이더(walls.ts wallLayer)와 같은 벽 그룹: 클래스 후보 중 floor(hash(tint + 0.25) × 4). */
export function facadeWallGroup(cls: number, tint: number): string {
  const choices = FACADE_WALL_CHOICES[Math.min(Math.max(cls, 0), FACADE_WALL_CHOICES.length - 1)] as readonly string[];
  return choices[Math.min(Math.floor(tslHash(tint + 0.25) * 4), 3)] as string;
}

/** 셰이더(library layerOfIndex)와 같은 그룹 안 레이어: start + min(floor(hash(tint + 0.75) × count), count − 1). */
export function facadeLayerIndex(range: readonly [number, number], tint: number): number {
  const [start, count] = range;
  return start + Math.min(Math.floor(tslHash(tint + 0.75) * count), Math.max(count - 1, 0));
}
