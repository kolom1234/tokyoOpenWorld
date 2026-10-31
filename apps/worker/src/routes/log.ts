// `POST /api/log`(M11-T03, 01 §9·13 §4): 게임 오류 보고 → Workers Analytics Engine(데이터셋 sanpo_errors).
// 개인정보 없음: 쿠키·User-Agent 원문·cf 위치(국가·도시)·요청 헤더를 기록하지 않는다. IP는 요청 제한 키(해시)로만 — 저장 안 함(log-guard.ts).
// 본문은 허용 필드만 길이 자르고, 메시지·스택의 URL 질의·이메일·긴 숫자를 지운다. 샘플링(1 %)은 게임이 세션 단위로 — 샘플률은 허용 값만(F03, ADR-0103).
// 바인딩이 없으면(로컬·테스트) 기록 없이 204.
import type { Env } from '../env.ts';
import { json } from '../headers.ts';
import { guardLogRequest, readLimitedText } from '../log-guard.ts';

/** 본문 상한(UTF-8 바이트 — 문자 수 아님). 게임 보고는 1 KB 안팎. */
const MAX_BODY_BYTES = 4096;
const KINDS = new Set(['error', 'rejection', 'boot', 'worker', 'test']);
/** 게임이 보내는 샘플률(error-report.ts DEFAULT_REPORT_RATE = 0.01, staging `?report=force` = 1)만 받는다 — 극소값으로 1/rate 가중 집계가 부풀지 않게. */
export const REPORT_SAMPLE_RATES: readonly number[] = [0.01, 1];
/** 샘플률이 빠진 보고 = 1(가중 1 — 추정치를 부풀리지 않는 쪽). */
const DEFAULT_SAMPLE_RATE = 1;
const BACKENDS = new Set(['webgpu', 'webgl2', 'none']);

export interface ErrorReport {
  kind: string;
  message: string;
  /** 스택 첫 프레임(파일 경로·줄만 — 질의 문자열 제거). */
  frame: string;
  buildId: string;
  /** 게임 번들 버전(커밋 짧은 해시). */
  version: string;
  backend: string;
  /** detect-gpu 티어 0–3(모르면 -1). */
  gpuTier: number;
  /** 브라우저 계열 + 주 버전(예: chrome 141) — UA 원문은 보내지 않는다. */
  browser: string;
  lang: string;
  mode: string;
  /** 보낸 쪽 샘플률(REPORT_SAMPLE_RATES 중 하나) — 집계 때 1/rate 가중. */
  sampleRate: number;
}

/** 개인정보처럼 보일 수 있는 조각 제거(이메일·URL 질의/조각·6자리 이상 숫자) + 길이 제한. */
export function scrub(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, '$1')
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/\d{6,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const word = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/[^\w .:/-]/g, '').slice(0, max) : '';

/** 허용 필드만 꺼낸다(모르는 필드는 버림). 형식이 틀리면 null. `allowTest` = false(production)면 `kind:"test"`도 null. */
export function parseReport(raw: unknown, allowTest = true): ErrorReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = typeof o.kind === 'string' && KINDS.has(o.kind) ? o.kind : null;
  if (!kind || (kind === 'test' && !allowTest)) return null;
  const tier = typeof o.gpuTier === 'number' && Number.isInteger(o.gpuTier) ? Math.max(-1, Math.min(3, o.gpuTier)) : -1;
  const rate = o.sampleRate === undefined ? DEFAULT_SAMPLE_RATE : o.sampleRate;
  if (typeof rate !== 'number' || !REPORT_SAMPLE_RATES.includes(rate)) return null;
  return {
    kind,
    message: scrub(o.message, 200),
    frame: scrub(o.frame, 160),
    buildId: word(o.buildId, 40),
    version: word(o.version, 16),
    backend: typeof o.backend === 'string' && BACKENDS.has(o.backend) ? o.backend : 'none',
    gpuTier: tier,
    browser: word(o.browser, 24),
    lang: word(o.lang, 5),
    mode: word(o.mode, 12),
    sampleRate: rate,
  };
}

/** AE 한 점: index = 종류(샘플링 키), blobs 순서 = SQL blob1…blob9, doubles = gpuTier·sampleRate. */
export function dataPoint(r: ErrorReport): { indexes: string[]; blobs: string[]; doubles: number[] } {
  return {
    indexes: [r.kind],
    blobs: [r.kind, r.message, r.frame, r.buildId, r.version, r.backend, r.browser, r.lang, r.mode],
    doubles: [r.gpuTier, r.sampleRate],
  };
}

export async function handleLog(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const rejected = await guardLogRequest(request, env);
  if (rejected !== undefined) return rejected;
  const body = await readLimitedText(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const r = parseReport(raw, env.DEPLOY_ENV !== 'production');
  if (!r) return json(400, { error: 'bad_report' });
  env.LOGS?.writeDataPoint(dataPoint(r));
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
