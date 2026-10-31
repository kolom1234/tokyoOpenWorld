// M11-T03 오류 보고(게임 쪽): 세션 샘플링·세션당 3건·같은 메시지 1번, 첫 프레임 경로만(호스트·질의 없음), UA → 계열 + 주 버전.
import { describe, expect, it } from 'vitest';
import { browserOf, createReporter, dedupeKey, firstFrame } from '../src/error-report.ts';

const ctx = { buildId: () => 'b1', backend: () => 'webgpu', gpuTier: () => 2, lang: () => 'ko', mode: () => 'hud' };

describe('error reporting', () => {
  it('samples per session and caps at 3 distinct messages', () => {
    const sent: string[] = [];
    const off = createReporter(ctx, {
      rate: 0.01,
      force: false,
      version: 'v',
      send: (b) => sent.push(b),
      random: () => 0.5,
    });
    expect(off.report('error', new Error('a'))).toBe(false);
    const on = createReporter(ctx, {
      rate: 0.01,
      force: false,
      version: 'v',
      send: (b) => sent.push(b),
      random: () => 0.001,
    });
    for (const m of ['a', 'a', 'b', 'c', 'd']) on.report('error', new Error(m));
    expect(sent).toHaveLength(3);
    const first = JSON.parse(sent[0] as string) as Record<string, unknown>;
    expect(first).toMatchObject({
      kind: 'error',
      message: 'Error: a',
      buildId: 'b1',
      backend: 'webgpu',
      gpuTier: 2,
      sampleRate: 0.01,
    });
    expect(Object.keys(first).sort()).toEqual(
      [
        'backend',
        'browser',
        'buildId',
        'frame',
        'gpuTier',
        'kind',
        'lang',
        'message',
        'mode',
        'sampleRate',
        'version',
      ].sort(),
    );
  });
  it('sends a repeating error once even when only numbers differ (F03)', () => {
    const sent: string[] = [];
    const r = createReporter(ctx, { rate: 1, force: false, version: 'v', send: (b) => sent.push(b), random: () => 0 });
    for (let frame = 0; frame < 50; frame++)
      r.report('error', new Error(`cell L0_${frame}_3 failed at ${frame * 16} ms`));
    r.report('rejection', new Error('cell L0_1_3 failed at 16 ms'));
    expect(sent).toHaveLength(2);
    expect(dedupeKey('error', 'x 12 y 3')).toBe(dedupeKey('error', 'x 99 y 7'));
    expect(dedupeKey('error', 'x')).not.toBe(dedupeKey('boot', 'x'));
  });
  it('force reports at rate 1', () => {
    const sent: string[] = [];
    createReporter(ctx, {
      rate: 0.01,
      force: true,
      version: 'v',
      send: (b) => sent.push(b),
      random: () => 0.99,
    }).report('test', 'boom');
    expect(JSON.parse(sent[0] as string)).toMatchObject({ kind: 'test', message: 'Error: boom', sampleRate: 1 });
  });
  it('keeps only the path:line:col of the first frame and the browser family/major', () => {
    expect(firstFrame('Error: x\n    at f (https://earthaimap.com/assets/main-ab.js?v=2:10:5)')).toBe(
      '/assets/main-ab.js:10:5',
    );
    expect(firstFrame(undefined)).toBe('');
    expect(
      browserOf(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('chrome 141');
    expect(browserOf('Mozilla/5.0 … Chrome/140.0 Safari/537.36 Edg/140.0.1')).toBe('edge 140');
    expect(browserOf('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/18.1 Safari/605.1.15')).toBe('safari 18');
  });
});
