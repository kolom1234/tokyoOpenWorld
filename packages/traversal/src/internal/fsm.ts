// 이동 모드 상태기계: 등록·요구조건 검사·원자적 전환(exit → enter → mode/changed). see docs/09-traversal.md §1
import type { ModeId } from '@sanpo/core';
import type { ModeRequirement, TraversalContext, TraversalMode } from '../api.ts';

export interface ModeFsm {
  readonly current: TraversalMode | undefined;
  readonly previous: ModeId | undefined;
  register(mode: TraversalMode): void;
  /** 미등록·요구조건 미충족이면 false. 같은 모드 재요청은 params로 재진입. */
  request(to: ModeId, params?: unknown): boolean;
}

/** M01–M03: physics 없음. trains는 컨텍스트에 함수가 있으면 충족. */
export function availableRequirements(ctx: TraversalContext): ReadonlySet<ModeRequirement> {
  const s = new Set<ModeRequirement>();
  if (ctx.trains !== undefined) s.add('trains');
  return s;
}

export function createModeFsm(ctx: TraversalContext): ModeFsm {
  const modes = new Map<ModeId, TraversalMode>();
  const available = availableRequirements(ctx);
  let current: TraversalMode | undefined;
  let previous: ModeId | undefined;

  return {
    get current() {
      return current;
    },
    get previous() {
      return previous;
    },
    register(mode) {
      if (modes.has(mode.id)) throw new Error(`traversal: mode '${mode.id}' already registered`);
      modes.set(mode.id, mode);
    },
    request(to, params) {
      const next = modes.get(to);
      if (next === undefined || !next.requires.every((r) => available.has(r))) return false;
      const from = current?.id ?? to;
      current?.exit(ctx, to);
      if (current !== undefined && current.id !== to) previous = current.id;
      current = next;
      next.enter(ctx, from, params);
      if (from !== to) ctx.bus.emit('mode/changed', { from, to });
      return true;
    },
  };
}
