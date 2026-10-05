// 회전 선택(10 §5.1, M06-T05): 차선 끝에서 다음 차선 = 가중 무작위(직진 0.6·좌 0.25·우 0.15 — 있는 것끼리 정규화). 결정론 = 차량 난수.
import type { Rng } from '@sanpo/core';
import { LANE_TURN } from '@sanpo/tile-format';
import type { Lane } from './lane-graph.ts';

const WEIGHT: Readonly<Record<number, number>> = {
  [LANE_TURN.straight]: 0.6,
  [LANE_TURN.left]: 0.25,
  [LANE_TURN.right]: 0.15,
};

export function chooseNext(options: readonly Lane[], rng: Rng): Lane | undefined {
  if (options.length <= 1) return options[0];
  const w = options.map((l) => WEIGHT[l.turn] ?? 0.1);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * sum;
  for (let i = 0; i < options.length; i++) {
    r -= w[i] as number;
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}
