// 발소리(11 §3, M09-T04 — ADR-0079): 지면 재질(JCOL_MATERIAL) → 발소리 세트, 보폭 시계(이동 거리 누적), 라운드로빈(직전 두 개 제외) + 피치 ±5 %.
import { JCOL_MATERIAL } from '@sanpo/tile-format';

/** JCOL 재질 → 발소리 세트 id(manifest outputs kind steps). */
export function stepSetOf(material: number): string {
  switch (material) {
    case JCOL_MATERIAL.asphalt:
      return 'step-asphalt';
    case JCOL_MATERIAL.metal:
      return 'step-metal';
    case JCOL_MATERIAL.wood:
      return 'step-wood';
    case JCOL_MATERIAL.grass:
      return 'step-grass';
    case JCOL_MATERIAL.soil:
      return 'step-soil';
    case JCOL_MATERIAL.tile:
    case JCOL_MATERIAL.glass:
      return 'step-tile';
    default:
      return 'step-concrete';
  }
}

/** 보폭(m): 걷기 1.4 m/s ≈ 0.75 m, 달리기 5 m/s ≈ 1.45 m(사람 보폭 근사 — 걸음 주기 ≈ 1.9 → 3.4 Hz). */
export function strideM(speedMs: number): number {
  return 0.48 + 0.195 * Math.min(speedMs, 6);
}

export interface StepEvent {
  /** 세트 안 걸음 번호. */
  index: number;
  /** 재생 속도(피치) 0.95–1.05. */
  rate: number;
  /** 이득(속력 비례 0.45–1). */
  gain: number;
}

/** 보폭 시계 + 라운드로빈. rand = 결정론 난수(0..1) — 런타임은 core rng. */
export class StepClock {
  private acc = 0;
  private recent: number[] = [];

  /** dt 동안 이동. 걸음이 나야 하면 이벤트(최대 1개). count = 세트 걸음 수. */
  advance(speedMs: number, grounded: boolean, dtS: number, count: number, rand: () => number): StepEvent | null {
    if (!grounded || speedMs < 0.3 || count <= 0) {
      this.acc = Math.min(this.acc, 0.4);
      return null;
    }
    this.acc += speedMs * dtS;
    const stride = strideM(speedMs);
    if (this.acc < stride) return null;
    this.acc -= stride;
    if (this.acc > stride) this.acc = 0;
    let index = Math.floor(rand() * count);
    for (let k = 0; k < count && this.recent.includes(index); k++) index = (index + 1) % count;
    this.recent.push(index);
    if (this.recent.length > Math.min(2, count - 1)) this.recent.shift();
    return { index, rate: 0.95 + rand() * 0.1, gain: 0.45 + 0.55 * Math.min(1, speedMs / 5) };
  }
}
