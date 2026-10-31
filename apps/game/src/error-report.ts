// 원격 오류 보고(M11-T03, 01 §9): 전역 오류·처리 안 된 거부 → `POST /api/log`(Worker → Analytics Engine).
// 세션 단위 1 % 샘플링(crypto 난수 — 결정론 대상 아님), 세션당 최대 3건·같은 메시지 1번(숫자만 다른 반복 포함 — F03). 개인정보 없음: 메시지·첫 프레임(URL 호스트·질의 제거는 Worker도 다시)·
// 빌드·번들 버전·백엔드·품질 티어·브라우저 계열/주 버전·언어·화면만 — UA 원문·위치·식별자 없음. `?report=force` = 100 %(staging 수락 확인용).
export interface ReportContext {
  buildId(): string;
  backend(): string;
  /** 품질 티어 0(low)–3(ultra), 모르면 -1. */
  gpuTier(): number;
  lang(): string;
  mode(): string;
}

export interface ReporterOptions {
  rate: number;
  force: boolean;
  version: string;
  send?: (body: string) => void;
  random?: () => number;
}

export const DEFAULT_REPORT_RATE = 0.01;
const MAX_PER_SESSION = 3;

/** 중복 판정 키: 숫자(좌표·id·프레임 번호)만 다른 같은 오류는 한 번만 보낸다(매 프레임 반복 오류). */
export function dedupeKey(kind: string, message: string): string {
  return `${kind}|${message.replace(/\d+/g, '#')}`;
}

/** UA → 계열 + 주 버전만(예: "chrome 141"). 앞 규칙이 우선(Edge·Opera UA에도 Chrome이 있다). */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\/(\d+)/, 'edge'],
  [/OPR\/(\d+)/, 'opera'],
  [/Firefox\/(\d+)/, 'firefox'],
  [/Chrome\/(\d+)/, 'chrome'],
  [/Version\/(\d+)[^ ]* .*Safari/, 'safari'],
];

export function browserOf(ua: string): string {
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return 'other';
}

/** 스택 첫 프레임(파일 경로:줄:열만). */
export function firstFrame(stack: string | undefined): string {
  const line = stack?.split('\n').find((l) => /:\d+:\d+/.test(l)) ?? '';
  const m = /((?:https?:\/\/[^/\s)]+)?\/[^\s)?#]*)(?:\?[^\s):]*)?(:\d+:\d+)/.exec(line);
  return m ? `${(m[1] as string).replace(/^https?:\/\/[^/]+/, '')}${m[2]}` : '';
}

const cryptoRandom = (): number => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] as number) / 2 ** 32;
};

export function createReporter(ctx: ReportContext, o: ReporterOptions): { report(kind: string, e: unknown): boolean } {
  const sampled = o.force || (o.random ?? cryptoRandom)() < o.rate;
  const seen = new Set<string>();
  const send =
    o.send ??
    ((body: string) => {
      void fetch('/api/log', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
        .then(() => undefined)
        .catch(() => undefined);
    });
  return {
    report(kind, e) {
      if (!sampled || seen.size >= MAX_PER_SESSION) return false;
      const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : String(e));
      const message = `${err.name}: ${err.message}`.slice(0, 300);
      const key = dedupeKey(kind, message);
      if (seen.has(key)) return false;
      seen.add(key);
      send(
        JSON.stringify({
          kind,
          message,
          frame: firstFrame(err.stack),
          buildId: ctx.buildId(),
          version: o.version,
          backend: ctx.backend(),
          gpuTier: ctx.gpuTier(),
          browser: browserOf(navigator.userAgent),
          lang: ctx.lang(),
          mode: ctx.mode(),
          sampleRate: o.force ? 1 : o.rate,
        }),
      );
      return true;
    },
  };
}

/** window 'error'·'unhandledrejection' → 보고. 반환 = 해제. */
export function installErrorReporting(win: Window, r: ReturnType<typeof createReporter>): () => void {
  const onError = (ev: ErrorEvent) => r.report('error', ev.error ?? ev.message);
  const onRejection = (ev: PromiseRejectionEvent) => r.report('rejection', ev.reason);
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
