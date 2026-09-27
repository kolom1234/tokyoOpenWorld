// 테스트 공용: 기록 로거 싱크.
import { createLogger, type Logger, type LogLevel } from '../src/index.ts';

export interface LogRecord {
  level: LogLevel;
  tag: string;
  args: readonly unknown[];
}

export function recordingLogger(): { log: Logger; records: LogRecord[] } {
  const records: LogRecord[] = [];
  const log = createLogger({ level: 'debug', sink: (level, tag, args) => records.push({ level, tag, args }) });
  return { log, records };
}
