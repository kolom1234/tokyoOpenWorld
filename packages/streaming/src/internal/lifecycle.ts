// 셀 상태기계(06 §2): absent → queued → fetching → decoding → ready ─(render ack)→ live → evicting → absent, 실패 → failed(60 s 후 재요청 가능).
// 시계는 주입(ms). 부작용(콜백·이벤트)은 서비스 몫 — 여기는 상태·보류 payload·ack 기록만. see docs/06-world-streaming.md §2, ADR-0023
import { type CellKey, unpackCellKey } from '@sanpo/core';
import type { CellPayload } from '@sanpo/tile-format';
import type { CellState, ConsumerId } from '../api.ts';
import type { LoadStage } from './scheduler.ts';

interface CellRecord {
  state: CellState;
  acks: Set<ConsumerId>;
  /** 디코드 완료·onReady 전(ready 상태에서만). */
  payload?: CellPayload;
  /** onReady로 넘겼는가(해제 시 onEvicted 대상). */
  delivered: boolean;
  failedAt: number;
}

export const IN_FLIGHT: ReadonlySet<CellState> = new Set(['queued', 'fetching', 'decoding']);
export const RESIDENT: ReadonlySet<CellState> = new Set(['ready', 'live']);

export interface Lifecycle {
  stateOf(key: CellKey): CellState;
  /** absent이거나 failed 후 retryAfterMs가 지났으면 요청 가능. */
  requestable(key: CellKey, now: number): boolean;
  stage(key: CellKey, stage: LoadStage): void;
  loaded(key: CellKey, payload: CellPayload): void;
  failed(key: CellKey, now: number): void;
  /** 진행 중 요청 취소 → absent. */
  cancelled(key: CellKey): void;
  /** 보류 payload를 최대 max개 꺼내 delivered 표시(ready 순서). */
  takeReady(max: number): CellPayload[];
  /** 기록. render면 ready → live. 상주가 아니면 false. */
  ack(key: CellKey, consumer: ConsumerId): boolean;
  /** 상주 셀 해제 시작(evicting). 반환 = onReady로 넘긴 셀인가(onEvicted 대상). 상주가 아니면 undefined. */
  beginEvict(key: CellKey): boolean | undefined;
  /** evicting → absent(기록 삭제). */
  endEvict(key: CellKey): void;
  /** failed 중 retryAfterMs 지났고 keepKeys에 없는 기록 삭제(누수 방지). */
  pruneFailed(now: number, keepKeys: ReadonlySet<CellKey>): void;
  keys(filter: ReadonlySet<CellState>): CellKey[];
  pendingReady(): number;
  counts(): Record<CellState, number>;
  residentByLevel(): [number, number, number, number];
  /** 기록 수(누수 검사용). */
  readonly size: number;
  /** ready 큐 길이(옛 항목 포함, 누수 검사용). */
  readonly readyBacklog: number;
}

const emptyCounts = (): Record<CellState, number> => ({
  absent: 0,
  queued: 0,
  fetching: 0,
  decoding: 0,
  ready: 0,
  live: 0,
  evicting: 0,
  failed: 0,
});

class CellLifecycle implements Lifecycle {
  private readonly cells = new Map<CellKey, CellRecord>();
  /** ready 순서(FIFO). 해제·재적재된 키의 옛 항목은 takeReady에서 건너뛴다. */
  private readyQueue: CellKey[] = [];

  private readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    this.retryAfterMs = retryAfterMs;
  }

  private rec(key: CellKey): CellRecord {
    let r = this.cells.get(key);
    if (!r) {
      r = { state: 'absent', acks: new Set(), delivered: false, failedAt: 0 };
      this.cells.set(key, r);
    }
    return r;
  }

  stateOf(key: CellKey): CellState {
    return this.cells.get(key)?.state ?? 'absent';
  }

  requestable(key: CellKey, now: number): boolean {
    const r = this.cells.get(key);
    return !r || r.state === 'absent' || (r.state === 'failed' && now - r.failedAt >= this.retryAfterMs);
  }

  stage(key: CellKey, stage: LoadStage): void {
    this.rec(key).state = stage;
  }

  loaded(key: CellKey, payload: CellPayload): void {
    const r = this.rec(key);
    r.state = 'ready';
    r.payload = payload;
    r.delivered = false;
    r.acks.clear();
    this.readyQueue.push(key);
  }

  failed(key: CellKey, now: number): void {
    const r = this.rec(key);
    r.state = 'failed';
    r.failedAt = now;
  }

  cancelled(key: CellKey): void {
    const r = this.cells.get(key);
    if (r && IN_FLIGHT.has(r.state)) this.cells.delete(key);
  }

  takeReady(max: number): CellPayload[] {
    const out: CellPayload[] = [];
    while (out.length < max && this.readyQueue.length > 0) {
      const key = this.readyQueue.shift() as CellKey;
      const r = this.cells.get(key);
      if (!r?.payload || r.state !== 'ready') continue;
      out.push(r.payload);
      delete r.payload;
      r.delivered = true;
    }
    return out;
  }

  ack(key: CellKey, consumer: ConsumerId): boolean {
    const r = this.cells.get(key);
    if (!r || !RESIDENT.has(r.state) || !r.delivered) return false;
    r.acks.add(consumer);
    if (consumer === 'render') r.state = 'live';
    return true;
  }

  beginEvict(key: CellKey): boolean | undefined {
    const r = this.cells.get(key);
    if (!r || !RESIDENT.has(r.state)) return undefined;
    r.state = 'evicting';
    delete r.payload;
    return r.delivered;
  }

  endEvict(key: CellKey): void {
    if (this.cells.get(key)?.state === 'evicting') this.cells.delete(key);
  }

  pruneFailed(now: number, keepKeys: ReadonlySet<CellKey>): void {
    for (const [key, r] of this.cells) {
      if (r.state === 'failed' && now - r.failedAt >= this.retryAfterMs && !keepKeys.has(key)) this.cells.delete(key);
    }
  }

  keys(filter: ReadonlySet<CellState>): CellKey[] {
    const out: CellKey[] = [];
    for (const [key, r] of this.cells) if (filter.has(r.state)) out.push(key);
    return out;
  }

  pendingReady(): number {
    let n = 0;
    for (const r of this.cells.values()) if (r.state === 'ready' && r.payload) n++;
    return n;
  }

  counts(): Record<CellState, number> {
    const c = emptyCounts();
    for (const r of this.cells.values()) c[r.state]++;
    return c;
  }

  residentByLevel(): [number, number, number, number] {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    for (const [key, r] of this.cells) if (RESIDENT.has(r.state)) out[unpackCellKey(key).level]++;
    return out;
  }

  get size(): number {
    return this.cells.size;
  }

  get readyBacklog(): number {
    return this.readyQueue.length;
  }
}

export function createLifecycle(retryAfterMs: number): Lifecycle {
  return new CellLifecycle(retryAfterMs);
}
