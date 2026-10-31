// 정적 에셋 헤더(public/_headers, docs/13 §3): 문서 응답 정책 헤더와 HSTS 중복 방지(ADR-0102).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `_headers`를 경로 패턴 → (헤더 이름 소문자 → 값) 블록으로 읽는다. `! 이름` 분리 줄은 건너뛴다. */
function parseHeaders(text: string): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = new Map();
      blocks.set(line.trim(), current);
      continue;
    }
    const m = /^\s+([^!:\s][^:]*):\s*(.*)$/.exec(line);
    if (m && current) current.set(m[1]?.toLowerCase() ?? '', m[2] ?? '');
  }
  return blocks;
}

const blocks = parseHeaders(readFileSync(resolve(import.meta.dirname, '../public/_headers'), 'utf8'));

describe('public/_headers', () => {
  it('sends referrer and permissions policies on every document', () => {
    const all = blocks.get('/*');
    expect(all?.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    const policy = all?.get('permissions-policy') ?? '';
    for (const off of ['camera', 'microphone', 'geolocation', 'payment']) expect(policy).toContain(`${off}=()`);
    // 게임이 쓰는 기능(게임패드·전체 화면·오디오 자동 재생)은 끄지 않는다.
    for (const used of ['gamepad', 'fullscreen', 'autoplay']) expect(policy).not.toContain(used);
  });

  it('leaves HSTS to the Cloudflare zone setting (no duplicate header)', () => {
    for (const headers of blocks.values()) expect(headers.has('strict-transport-security')).toBe(false);
  });
});
