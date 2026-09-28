// 셀 로드 큐: 점수 낮은 순으로 fetch(동시 ≤ maxConcurrent) → 디코드 풀(대기 ≤ 풀 용량), 셀별 AbortController로 단계 무관 취소.
// 상태기계·재시도 정책(3회 → failed → 60 s)은 lifecycle(M02-T03) 몫 — 여기는 1회 로드 결과만 onDone으로 알린다. see docs/06-world-streaming.md §2, §4
import { type CellKey, err, type Result } from '@sanpo/core';
import type { SectionType } from '@sanpo/tile-format';
import type { CellFetchError, DecodeError, DecodePool, DecodeResult, FetchConfig, Fetcher } from '../api.ts';
import type { CellIndex } from './cell-index.ts';

export type LoadStage = 'queued' | 'fetching' | 'decoding';
export type LoadError =
  | { stage: 'index'; message: string }
  | { stage: 'fetch'; error: CellFetchError }
  | { stage: 'decode'; error: DecodeError };
export type LoadResult = Result<DecodeResult & { fromCache: boolean }, LoadError>;

export interface LoadSchedulerDeps {
  index: CellIndex;
  fetcher: Fetcher;
  pool: DecodePool;
  buildId: string;
  config: FetchConfig;
  /** 디코드 대기 한도(= 워커 수 × perWorker, 06 §4). */
  decodeCapacity: number;
  verifyHash: boolean;
  onStage?: (key: CellKey, stage: LoadStage) => void;
  /** 취소된 셀은 호출하지 않는다. */
  onDone: (key: CellKey, r: LoadResult) => void;
}

export interface LoadScheduler {
  /** 큐에 넣거나(이미 대기 중이면 점수만 갱신). cells.idx에 없으면 false. 진행 중(fetching·decoding)이면 무시하고 true. */
  request(key: CellKey, score: number, sections?: readonly SectionType[]): boolean;
  /** 대기·fetch·디코드 어느 단계든 취소. 없던 셀이면 false. */
  cancel(key: CellKey): boolean;
  stageOf(key: CellKey): LoadStage | undefined;
  stats(): { queued: number; fetching: number; decoding: number };
  dispose(): void;
}

interface Job {
  key: CellKey;
  score: number;
  sections: readonly SectionType[] | undefined;
  stage: LoadStage;
  ac: AbortController;
}

/** 워커가 파일 자체가 잘못됐다고 본 오류 → 캐시 사본 삭제. */
const BAD_FILE: ReadonlySet<DecodeError['code']> = new Set([
  'mismatch',
  'truncated',
  'magic',
  'version',
  'flags',
  'header',
  'range',
  'align',
  'corrupt',
]);

interface State {
  deps: LoadSchedulerDeps;
  jobs: Map<CellKey, Job>;
  fetching: number;
  decoding: number;
}

/** 대기 중 최저 점수(동률은 키 오름차순). */
function nextQueued(s: State): Job | undefined {
  let best: Job | undefined;
  for (const j of s.jobs.values()) {
    if (j.stage !== 'queued') continue;
    if (!best || j.score < best.score || (j.score === best.score && j.key < best.key)) best = j;
  }
  return best;
}

function setStage(s: State, j: Job, stage: LoadStage): void {
  j.stage = stage;
  s.deps.onStage?.(j.key, stage);
}

function finish(s: State, j: Job, r: LoadResult): void {
  if (s.jobs.get(j.key) !== j) return; // 취소·교체됨
  s.jobs.delete(j.key);
  if (!j.ac.signal.aborted) s.deps.onDone(j.key, r);
}

async function run(s: State, j: Job): Promise<void> {
  const { deps } = s;
  const rec = deps.index.get(j.key);
  s.fetching++;
  setStage(s, j, 'fetching');
  const f = await deps.fetcher.fetchCell(j.key, rec?.byteLength ?? 0, j.ac.signal).finally(() => s.fetching--);
  if (!f.ok) return finish(s, j, err({ stage: 'fetch', error: f.error }));
  if (j.ac.signal.aborted) return;
  s.decoding++;
  setStage(s, j, 'decoding');
  pump(s);
  const req = {
    key: j.key,
    buildId: deps.buildId,
    ...(deps.verifyHash && rec ? { hash32: rec.hash32 } : {}),
    ...(j.sections ? { sections: j.sections } : {}),
  };
  const d = await deps.pool.decode(f.value.bytes, req, j.ac.signal).finally(() => s.decoding--);
  if (!d.ok && BAD_FILE.has(d.error.code)) void deps.fetcher.invalidate(j.key);
  finish(
    s,
    j,
    d.ok ? { ok: true, value: { ...d.value, fromCache: f.value.fromCache } } : err({ stage: 'decode', error: d.error }),
  );
}

function pump(s: State): void {
  const { config, decodeCapacity } = s.deps;
  while (s.fetching < config.maxConcurrent && s.fetching + s.decoding < config.maxConcurrent + decodeCapacity) {
    const j = nextQueued(s);
    if (!j) return;
    void run(s, j).finally(() => pump(s));
  }
}

export function createLoadScheduler(deps: LoadSchedulerDeps): LoadScheduler {
  const s: State = { deps, jobs: new Map(), fetching: 0, decoding: 0 };
  return {
    request(key, score, sections) {
      if (!deps.index.has(key)) return false;
      const j = s.jobs.get(key);
      if (j) {
        if (j.stage === 'queued') j.score = score;
        return true;
      }
      const job: Job = { key, score, sections, stage: 'queued', ac: new AbortController() };
      s.jobs.set(key, job);
      deps.onStage?.(key, 'queued');
      pump(s);
      return true;
    },
    cancel(key) {
      const j = s.jobs.get(key);
      if (!j) return false;
      s.jobs.delete(key);
      j.ac.abort();
      return true;
    },
    stageOf: (key) => s.jobs.get(key)?.stage,
    stats() {
      let queued = 0;
      for (const j of s.jobs.values()) if (j.stage === 'queued') queued++;
      return { queued, fetching: s.fetching, decoding: s.decoding };
    },
    dispose() {
      for (const j of s.jobs.values()) j.ac.abort();
      s.jobs.clear();
    },
  };
}
