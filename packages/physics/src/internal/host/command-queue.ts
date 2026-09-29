// 명령 큐: 한 프레임 동안 모은 명령을 다음 step 메시지로 한 번에(08 §1 "메인은 명령 큐"). 캐릭터 입력은 핸들당 마지막 것만(같은 프레임 덮어쓰기).
import type { Command } from '../protocol.ts';

export interface CommandQueue {
  push(c: Command): void;
  /** 모은 명령을 꺼내고 비운다. */
  drain(): Command[];
  readonly size: number;
}

export function createCommandQueue(): CommandQueue {
  let q: Command[] = [];
  return {
    push(c) {
      if (c.c === 'charInput') {
        const i = q.findIndex((x) => x.c === 'charInput' && x.h === c.h);
        if (i >= 0) {
          q[i] = c;
          return;
        }
      }
      q.push(c);
    },
    drain() {
      const out = q;
      q = [];
      return out;
    },
    get size() {
      return q.length;
    },
  };
}
