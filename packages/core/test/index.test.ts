// @sanpo/core 공개 엔트리 스모크: 모듈 카드의 팩토리·상수가 노출되는지.
import { describe, expect, it } from 'vitest';
import {
  cellIdString,
  createEventBus,
  createLogger,
  createRng,
  createScheduler,
  createWorkerSupervisor,
  hash32,
  mergeConfig,
  packCellKey,
  unpackCellKey,
  WORLD_SEED,
} from '../src/index.ts';

describe('@sanpo/core public entry', () => {
  it('exposes factories and constants', () => {
    const fns = [
      createRng,
      hash32,
      createEventBus,
      createLogger,
      createScheduler,
      mergeConfig,
      createWorkerSupervisor,
      packCellKey,
      unpackCellKey,
      cellIdString,
    ];
    for (const f of fns) expect(typeof f).toBe('function');
    expect(WORLD_SEED).toBe(0x53414e50);
  });
});
