// `?quality=`·`?post=` 파싱(M03-T07).
import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/boot.ts';
import { parsePostFlag, parseQualityFlag } from '../src/debug/post-flags.ts';

describe('post flags', () => {
  it('parses tiers and effect overrides, ignoring junk', () => {
    expect(parseQualityFlag('medium')).toBe('medium');
    expect(parseQualityFlag('epic')).toBeUndefined();
    expect(parsePostFlag('ssr:0,ao:gtao,aoScale:1,scale:0.75,bogus:1,taa:x')).toEqual({
      ssr: false,
      ao: 'gtao',
      aoScale: 1,
      renderScale: 0.75,
    });
    const f = parseFlags('?quality=low&post=bloom:1');
    expect([f.quality, f.post]).toEqual(['low', { bloom: true }]);
  });
});
