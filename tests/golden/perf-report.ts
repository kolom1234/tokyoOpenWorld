// `pnpm perf` 결과 → 예산 판정(14 §2)·perf-results/<날짜>.json(원본)·docs/generated/perf-latest.md(요약 ≤ 60줄).
import { mkdirSync, writeFileSync } from 'node:fs';
import { pct, round, type StatSample } from './perf-helpers.ts';

export interface PathRun {
  id: string;
  label: string;
  seconds: number;
  intervals: number[];
  work: number[];
  stats: StatSample[];
  gpu: { drawW: number[]; limitW: number[]; memMiB: number[] };
  gpuMemBaseMiB: number;
  stalls: number;
  /** 스케줄러 시스템별 누적(측정 구간). */
  systems: { id: string; totalMs: number; maxMs: number; calls: number }[];
}

export interface BootRun {
  firstDisplayS: number;
  transferMB: number;
  log: string[];
}

const max = (a: readonly number[]) => (a.length ? Math.max(...a) : 0);

/** GPU 패스 비중(%) 상위 8 — 표본마다 합 대비 비율의 평균(`PERF_GPU_TIMING=1`). */
function passShare(stats: readonly StatSample[]): { label: string; pct: number }[] {
  const acc = new Map<string, number>();
  let n = 0;
  for (const s of stats) {
    const total = s.gpuPasses.reduce((a, p) => a + p.ms, 0);
    if (total <= 0) continue;
    n++;
    for (const p of s.gpuPasses) acc.set(p.label, (acc.get(p.label) ?? 0) + p.ms / total);
  }
  return [...acc]
    .map(([label, v]) => ({ label, pct: round((100 * v) / Math.max(1, n), 1) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
}

export function summarize(r: PathRun) {
  return {
    id: r.id,
    label: r.label,
    frames: r.intervals.length,
    frameP50: round(pct(r.intervals, 0.5)),
    frameP90: round(pct(r.intervals, 0.9)),
    frameP95: round(pct(r.intervals, 0.95)),
    /** 25 ms 넘은 프레임 비율(%). */
    over25Pct: round((100 * r.intervals.filter((v) => v > 25).length) / Math.max(1, r.intervals.length), 1),
    frameP99: round(pct(r.intervals, 0.99)),
    frameMax: round(max(r.intervals)),
    mainP50: round(pct(r.work, 0.5)),
    mainP95: round(pct(r.work, 0.95)),
    mainMax: round(max(r.work)),
    physicsTickMaxMs: round(max(r.stats.map((s) => s.physicsTickMs))),
    simP95TickMs: round(max(r.stats.map((s) => s.simP95TickMs))),
    heapMaxMB: round(max(r.stats.map((s) => s.heapMB)), 0),
    gpuMemMaxMB: round(max(r.gpu.memMiB) - r.gpuMemBaseMiB, 0),
    drawCallsP50: pct(
      r.stats.map((s) => s.drawCalls),
      0.5,
    ),
    trianglesP50M: round(
      pct(
        r.stats.map((s) => s.triangles),
        0.5,
      ) / 1e6,
    ),
    renderScaleMin: round(Math.min(...r.stats.map((s) => s.renderScale), 1)),
    stalls: r.stalls,
    gpuPassShare: passShare(r.stats),
    /** 프레임당 평균 ms 상위 6 시스템. */
    topSystems: [...r.systems]
      .map((x) => ({ id: x.id, avgMs: round(x.totalMs / Math.max(1, x.calls), 3), maxMs: round(x.maxMs, 1) }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 6),
    gpuW: {
      median: round(pct(r.gpu.drawW, 0.5), 1),
      max: round(max(r.gpu.drawW), 1),
      limit: round(pct(r.gpu.limitW, 0.5), 1),
    },
  };
}

type Summary = ReturnType<typeof summarize>;

type Row = [string, string, string, boolean];

/** 14 §2 경로 지표: [이름, 예산 글, 값, 통과 조건, 단위]. */
const PATH_BUDGETS: [string, string, (x: Summary) => number, (v: number) => boolean, string][] = [
  ['프레임 p50', '≤ 14 ms', (x) => x.frameP50, (v) => v <= 14, ' ms'],
  ['프레임 p95', '≤ 20 ms', (x) => x.frameP95, (v) => v <= 20, ' ms'],
  ['메인 스레드/프레임 p95', '≤ 6 ms', (x) => x.mainP95, (v) => v <= 6, ' ms'],
  ['물리 틱 최대', '≤ 4 ms', (x) => x.physicsTickMaxMs, (v) => v <= 4, ' ms'],
  ['sim 틱 p95', '≤ 12 ms', (x) => x.simP95TickMs, (v) => v <= 12, ' ms'],
  ['JS 힙 최대', '≤ 1536 MB', (x) => x.heapMaxMB, (v) => v <= 1536, ' MB'],
  ['GPU 메모리(장치 증가분)', '≤ 2048 MB', (x) => x.gpuMemMaxMB, (v) => v <= 2048, ' MB'],
  ['스트리밍 정지', '0회', (x) => x.stalls, (v) => v === 0, ''],
];

/** 14 §2 표 → [지표, 예산, 경로별 값, 통과]. */
function budgetRows(s: Summary[], boot: BootRun | null): Row[] {
  const fmt = (vals: number[], unit: string) => vals.map((v) => `${v}${unit}`).join(' / ');
  const rows: Row[] = PATH_BUDGETS.map(([name, budget, get, ok, unit]) => {
    const vals = s.map(get);
    return [name, budget, fmt(vals, unit), vals.every(ok)];
  });
  if (boot) {
    const mb = round(boot.transferMB, 1);
    const sec = round(boot.firstDisplayS, 2);
    rows.push(['초기 다운로드', '≤ 60 MB', `${mb} MB`, mb <= 60], ['첫 표시', '≤ 12 s', `${sec} s`, sec <= 12]);
  }
  return rows;
}

export function writeReport(
  env: Record<string, string>,
  runs: PathRun[],
  boot: BootRun | null,
  photo: Record<string, number> | null = null,
): string {
  const s = runs.map(summarize);
  const date = new Date().toISOString();
  mkdirSync('perf-results', { recursive: true });
  writeFileSync(
    `perf-results/${date.slice(0, 19).replace(/:/g, '')}.json`,
    `${JSON.stringify({ date, env, summary: s, boot, photo, runs }, null, 1)}\n`,
  );
  const rows = budgetRows(s, boot);
  const lines = [
    '# perf-latest (자동 생성 — `pnpm perf`, tests/golden/perf.spec.ts)',
    '',
    `측정 ${date.slice(0, 16)}Z · ${Object.entries(env)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
    `경로(값 순서): ${s.map((x) => `${x.id} = ${x.label}`).join(' · ')}`,
    '',
    '| 지표 | 예산(14 §2) | 값 | 판정 |',
    '|---|---|---|---|',
    ...rows.map(([n, b, v, ok]) => `| ${n} | ${b} | ${v} | ${ok ? '✅' : '⚠️'} |`),
    '',
    '| 경로 | 프레임 p50/p90/p95/p99/최대 ms(>25 ms %) | 메인 p50/p95/최대 ms | 드로우콜 | 삼각형 M | 렌더 스케일 최소 | GPU W 중앙/최대(상한) |',
    '|---|---|---|---|---|---|---|',
    ...s.map(
      (x) =>
        `| ${x.id} | ${x.frameP50}/${x.frameP90}/${x.frameP95}/${x.frameP99}/${x.frameMax} (${x.over25Pct}%) | ${x.mainP50}/${x.mainP95}/${x.mainMax} | ${x.drawCallsP50} | ${x.trianglesP50M} | ${x.renderScaleMin} | ${x.gpuW.median}/${x.gpuW.max} (${x.gpuW.limit}) |`,
    ),
    '',
    ...s
      .filter((x) => x.gpuPassShare.length)
      .map((x) => `- ${x.id} GPU 패스 비중: ${x.gpuPassShare.map((p) => `${p.label} ${p.pct}%`).join(', ')}`),
    ...s.map(
      (x) =>
        `- ${x.id} 시스템(프레임당 평균/최대 ms): ${x.topSystems.map((t) => `${t.id} ${t.avgMs}/${t.maxMs}`).join(', ')}`,
    ),
    `초과: ${
      rows
        .filter((r) => !r[3])
        .map((r) => r[0])
        .join(', ') || '없음'
    }`,
    boot ? `부팅 로그: ${boot.log.join(' · ')}` : '',
    photo
      ? `포토 DOF 전환 최장 프레임(ms): ${Object.entries(photo)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ')}`
      : '',
    '- 기준 GPU는 이 PC 한 대(RTX 3050 4GB Laptop) — 14 §2의 "RTX 3060급 / M1 Pro급 2종" 판정은 ⚠️(다른 기기 미측정).',
  ];
  const md = `${lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')}\n`;
  mkdirSync('docs/generated', { recursive: true });
  writeFileSync('docs/generated/perf-latest.md', md);
  return md;
}
