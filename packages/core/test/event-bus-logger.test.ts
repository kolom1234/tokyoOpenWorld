// 이벤트 버스(예외 격리·구독 해제) + 로거(레벨·child 태그). see docs/01-architecture.md §6
import { describe, expect, it } from 'vitest';
import { createEventBus, createLogger, type LogLevel, packCellKey } from '../src/index.ts';
import { recordingLogger } from './helpers.ts';

describe('EventBus', () => {
  it('delivers typed payloads synchronously to all handlers', () => {
    const { log } = recordingLogger();
    const bus = createEventBus(log);
    const got: number[] = [];
    bus.on('cell/ready', (p) => got.push(p.key));
    bus.on('cell/ready', (p) => got.push(p.key + 1));
    bus.emit('cell/ready', { key: packCellKey(0, 0, 0) });
    expect(got).toEqual([packCellKey(0, 0, 0), packCellKey(0, 0, 0) + 1]);
    bus.emit('cell/evicted', { key: 1 }); // 구독자 없음 → no-op
  });

  it('isolates handler exceptions: logs and continues with remaining handlers', () => {
    const { log, records } = recordingLogger();
    const bus = createEventBus(log);
    const got: string[] = [];
    bus.on('mode/changed', () => {
      throw new Error('bad handler');
    });
    bus.on('mode/changed', (p) => got.push(`${p.from}->${p.to}`));
    expect(() => bus.emit('mode/changed', { from: 'walk', to: 'drive' })).not.toThrow();
    expect(got).toEqual(['walk->drive']);
    const errors = records.filter((r) => r.level === 'error');
    expect(errors).toHaveLength(1);
    expect(String(errors[0]?.args[0])).toContain('mode/changed');
    expect(errors[0]?.args[1]).toBeInstanceOf(Error);
  });

  it('unsubscribe is idempotent and safe during dispatch', () => {
    const { log } = recordingLogger();
    const bus = createEventBus(log);
    const got: string[] = [];
    const offA = bus.on('poi/discovered', () => {
      got.push('a');
      offA();
      offA();
    });
    bus.on('poi/discovered', () => got.push('b'));
    bus.emit('poi/discovered', { poiId: 'x' });
    bus.emit('poi/discovered', { poiId: 'y' });
    expect(got).toEqual(['a', 'b', 'b']);
  });

  it('handlers subscribed during dispatch start on the next emit', () => {
    const { log } = recordingLogger();
    const bus = createEventBus(log);
    const got: string[] = [];
    bus.on('time/jumped', () => {
      got.push('outer');
      if (got.length === 1) bus.on('time/jumped', () => got.push('inner'));
    });
    bus.emit('time/jumped', { gameTimeMs: 0 });
    bus.emit('time/jumped', { gameTimeMs: 1 });
    expect(got).toEqual(['outer', 'outer', 'inner']);
  });
});

describe('Logger', () => {
  it('filters by level and scopes tags via child()', () => {
    const records: Array<{ level: LogLevel; tag: string; args: readonly unknown[] }> = [];
    const log = createLogger({ level: 'warn', sink: (level, tag, args) => records.push({ level, tag, args }) });
    log.debug('d');
    log.info('i');
    log.warn('w', 1);
    const child = log.child('streaming').child('decode');
    child.error('e');
    expect(records).toEqual([
      { level: 'warn', tag: '', args: ['w', 1] },
      { level: 'error', tag: 'streaming/decode', args: ['e'] },
    ]);
  });

  it('defaults to info level', () => {
    const records: LogLevel[] = [];
    const log = createLogger({ sink: (level) => records.push(level) });
    log.debug('x');
    log.info('y');
    expect(records).toEqual(['info']);
  });
});
