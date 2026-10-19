// M11-T04 효과음 자막: 중요 효과음만·30 m 안·2 s 안 반복 없음, 원래 오디오 호출은 그대로.
import type { AudioService } from '@sanpo/audio';
import type { Msg } from '@sanpo/ui';
import { describe, expect, it } from 'vitest';
import { withCaptions } from '../src/captions.ts';

describe('sound captions', () => {
  it('captions important sounds near the listener, once per 2 s, and still plays them', () => {
    const played: string[] = [];
    const base = {
      playAt: (id: string) => played.push(`at:${id}`),
      playUi: (id: string) => played.push(`ui:${id}`),
      setListener: () => undefined,
      stats: () => ({ ok: true }),
    } as unknown as AudioService;
    const caps: Msg[] = [];
    let t = 0;
    const a = withCaptions(
      base,
      (m) => caps.push(m),
      () => t,
    );
    a.setListener({ posWF: { x: 0, y: 0, z: 0 } } as never);
    a.playAt('stationChime', { x: 10, y: 3, z: 0 });
    a.playAt('stationChime', { x: 10, y: 3, z: 0 });
    a.playAt('doorChime', { x: 80, y: 0, z: 0 });
    a.playUi('uiClick');
    t = 2500;
    a.playAt('stationChime', { x: 5, y: 3, z: 0 });
    a.playUi('lcdChime');
    expect(caps.map((m) => m.key)).toEqual(['caption.stationChime', 'caption.stationChime', 'caption.lcdChime']);
    expect(played).toHaveLength(6);
    expect((a.stats() as unknown as { ok: boolean }).ok).toBe(true);
  });
});
