// 배선: traversal 관심점 → streaming(phase 45), 준비된 셀 → render.addCell + ack + 부모 HLOD 자식 숨김(phase 55, 적용 예산 2 ms),
// 해제 → 부모 자식 즉시 보임 → render.removeCell. streaming은 render를 모른다(01 §4). see docs/06-world-streaming.md §5–6, ADR-0024
import { type CellKey, type GameSystem, type Logger, unpackCellKey } from '@sanpo/core';
import { hlodChildIndex, parentOf } from '@sanpo/geo';
import type { RenderService } from '@sanpo/render';
import type { StreamingService } from '@sanpo/streaming';
import type { CellPayload } from '@sanpo/tile-format';
import type { TraversalService } from '@sanpo/traversal';

/** 01 §5: streaming(50) 직전에 관심점, 직후에 적용(renderPrep 70 전). */
export const INTEREST_PHASE = 45;
export const APPLY_PHASE = 55;
/** 06 §6: 프레임당 메인 적용 ≤ 2 ms(첫 셀은 예산과 무관하게 적용 — 진행 보장). */
export const APPLY_BUDGET_MS = 2;
/**
 * 프레임당 새 정점·인덱스 바이트 상한. GPU 업로드는 addCell이 아니라 다음 render에서 일어나 시간 예산에 안 잡힌다 →
 * 바이트로 나눈다(실측: 셀 추가 프레임에 render 4 ms 초과가 몰림). 첫 셀은 항상 적용.
 */
export const APPLY_BUDGET_BYTES = 4 * 1024 * 1024;

/** 셀 payload의 GPU 업로드 바이트(메시 속성 + 인덱스). */
export function uploadBytes(p: CellPayload): number {
  let n = 0;
  for (const m of Object.values(p.meshes)) {
    for (const pr of m?.primitives ?? []) {
      for (const a of Object.values(pr.attributes)) n += a.array.byteLength;
      n += pr.index?.byteLength ?? 0;
    }
  }
  return n;
}

export interface StreamingRenderStats {
  applied: number;
  queued: number;
  /** 예산 초과로 다음 프레임으로 미룬 횟수. */
  deferred: number;
  lastApplyMs: number;
  maxApplyMs: number;
  /** 한 프레임에 적용한 업로드 바이트 최대. */
  maxApplyBytes: number;
}

export interface StreamingRenderWiring {
  readonly systems: readonly GameSystem[];
  stats(): StreamingRenderStats;
  dispose(): void;
}

export interface StreamingRenderDeps {
  streaming: StreamingService;
  render: RenderService;
  traversal: Pick<TraversalService, 'interest'>;
  log: Logger;
  now?: () => number;
  budgetMs?: number;
  budgetBytes?: number;
}

/** 자식 셀(L0–L2)이 보이면 부모의 해당 자식 영역을 숨긴다(L3는 부모 없음). */
function setParentChild(render: RenderService, key: CellKey, visible: boolean): void {
  if (unpackCellKey(key).level === 3) return;
  const parent = parentOf(key);
  if (parent !== null) render.setHlodChildVisible(parent, hlodChildIndex(key), visible);
}

interface ApplyCtx {
  queue: CellPayload[];
  streaming: StreamingService;
  render: RenderService;
  now: () => number;
  budget: number;
  budgetBytes: number;
  st: StreamingRenderStats;
  log: Logger;
}

/** 큐 앞에서부터 예산(시간·업로드 바이트) 안에서 적용. 첫 셀은 항상. */
function applyQueue(c: ApplyCtx): void {
  const t0 = c.now();
  let n = 0;
  let bytes = 0;
  while (c.queue.length > 0) {
    const next = uploadBytes(c.queue[0] as CellPayload);
    if (n > 0 && (c.now() - t0 >= c.budget || bytes + next > c.budgetBytes)) break;
    const p = c.queue.shift() as CellPayload;
    bytes += next;
    c.render.addCell(p);
    c.streaming.ack(p.key, 'render');
    setParentChild(c.render, p.key, false);
    n++;
  }
  const { st } = c;
  if (c.queue.length > 0) st.deferred++;
  st.applied += n;
  st.lastApplyMs = c.now() - t0;
  st.maxApplyMs = Math.max(st.maxApplyMs, st.lastApplyMs);
  st.maxApplyBytes = Math.max(st.maxApplyBytes, bytes);
  if (st.lastApplyMs > c.budget * 2) c.log.debug(`apply ${n} cells ${st.lastApplyMs.toFixed(2)} ms`);
}

export function createStreamingRenderWiring(deps: StreamingRenderDeps): StreamingRenderWiring {
  const { streaming, render } = deps;
  const now = deps.now ?? (() => performance.now());
  const budget = deps.budgetMs ?? APPLY_BUDGET_MS;
  const budgetBytes = deps.budgetBytes ?? APPLY_BUDGET_BYTES;
  const queue: CellPayload[] = [];
  const st: StreamingRenderStats = {
    applied: 0,
    queued: 0,
    deferred: 0,
    lastApplyMs: 0,
    maxApplyMs: 0,
    maxApplyBytes: 0,
  };
  const offReady = streaming.onReady((p) => queue.push(p));
  const offEvicted = streaming.onEvicted((key) => {
    const qi = queue.findIndex((p) => p.key === key);
    if (qi >= 0) {
      queue.splice(qi, 1); // 아직 적용 전 → 렌더에 없음
      return;
    }
    setParentChild(render, key, true); // 부모 먼저 보이게(06 §5)
    render.removeCell(key);
  });
  const interest: GameSystem = {
    id: 'wiring.interest',
    phase: INTEREST_PHASE,
    update: () => streaming.setInterest(deps.traversal.interest),
    dispose: () => undefined,
  };
  const apply: GameSystem = {
    id: 'wiring.streamingRender',
    phase: APPLY_PHASE,
    update() {
      if (queue.length > 0) applyQueue({ queue, streaming, render, now, budget, budgetBytes, st, log: deps.log });
    },
    dispose() {
      offReady();
      offEvicted();
      queue.length = 0;
    },
  };
  return {
    systems: [interest, apply],
    stats: () => ({ ...st, queued: queue.length }),
    dispose: () => apply.dispose(),
  };
}
