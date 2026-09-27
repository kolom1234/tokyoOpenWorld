// 레벨·스코프 태그·싱크를 가진 로거. console 직접 사용은 이 파일의 기본 싱크만 허용. see docs/15-conventions.md §5
import type { Logger, LoggerOptions, LogLevel, LogSink } from '../api.ts';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

const consoleSink: LogSink = (level, tag, args) => {
  const prefix = tag ? `[${tag}]` : '[sanpo]';
  // biome-ignore lint/suspicious/noConsole: 기본 싱크는 console로 출력하는 유일한 지점
  console[level](prefix, ...args);
};

function makeLogger(minRank: number, sink: LogSink, tag: string): Logger {
  const emit = (level: LogLevel, args: unknown[]): void => {
    if (LEVEL_RANK[level] >= minRank) sink(level, tag, args);
  };
  return {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    // 하위 스코프는 '/'로 연결: log.child('streaming').child('decode') → "streaming/decode"
    child: (childTag) => makeLogger(minRank, sink, tag ? `${tag}/${childTag}` : childTag),
  };
}

/** 기본 level='info', sink=console. */
export function createLogger(opts: LoggerOptions = {}): Logger {
  return makeLogger(LEVEL_RANK[opts.level ?? 'info'], opts.sink ?? consoleSink, '');
}
