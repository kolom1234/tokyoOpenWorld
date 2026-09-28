// whenReady 대기자: 영역 안 셀(cells.idx에 있는 것)이 전부 live 또는 failed가 되면 resolve. 대기 중 대상은 pinned(로드·유지 강제).
// see docs/06-world-streaming.md §8
import type { CellKey, CellLevel } from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import type { CellState, WhenReadyRequest } from '../api.ts';
import type { CellIndex } from './cell-index.ts';
import { aabbDistanceM } from './geometry.ts';

const SETTLED: ReadonlySet<CellState> = new Set(['live', 'failed']);

interface Waiter {
  targets: CellKey[];
  resolve: () => void;
}

export interface Waiters {
  add(req: WhenReadyRequest): Promise<void>;
  /** 끝난 대기자 resolve. 대상 집합이 바뀌었으면 true(재계산 필요). */
  settle(stateOf: (key: CellKey) => CellState): boolean;
  readonly pinned: ReadonlySet<CellKey>;
  readonly size: number;
  /** 남은 대기자 모두 resolve(dispose). */
  flush(): void;
}

/** 영역 안 셀 목록(레벨 순, 레벨 안은 파일 순). */
export function targetsOf(index: CellIndex, req: WhenReadyRequest): CellKey[] {
  const out: CellKey[] = [];
  for (const lv of req.levels) {
    if (lv !== 0 && lv !== 1 && lv !== 2 && lv !== 3) continue;
    for (const key of index.keysAt(lv as CellLevel)) {
      if (aabbDistanceM(cellBoundsWF(key), req.centerWF.x, req.centerWF.z) <= req.radius) out.push(key);
    }
  }
  return out;
}

export function createWaiters(index: CellIndex): Waiters {
  let list: Waiter[] = [];
  let pinned = new Set<CellKey>();
  const rebuild = (): void => {
    pinned = new Set(list.flatMap((w) => w.targets));
  };
  return {
    add(req) {
      const targets = targetsOf(index, req);
      return new Promise<void>((resolve) => {
        list.push({ targets, resolve });
        rebuild();
      });
    },
    settle(stateOf) {
      const before = list.length;
      list = list.filter((w) => {
        if (!w.targets.every((k) => SETTLED.has(stateOf(k)))) return true;
        w.resolve();
        return false;
      });
      if (list.length === before) return false;
      rebuild();
      return true;
    },
    get pinned() {
      return pinned;
    },
    get size() {
      return list.length;
    },
    flush() {
      for (const w of list) w.resolve();
      list = [];
      rebuild();
    },
  };
}
