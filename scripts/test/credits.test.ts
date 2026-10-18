// M10-T06 크레딧 자동 생성: lock 모든 원천이 크레딧에(쓰지 않는 원천도), ATTRIBUTION 전용 항목 덧붙임, 게임 런타임 의존 OSS 라이선스(전이·워크스페이스 제외).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCredits, creditsData, ossNotices, ossPackages } from '../lib/credits.ts';

const ROOT = join(import.meta.dirname, '../..');

describe('credits', () => {
  it('lists every sources.lock entry and the attribution-only entries', () => {
    const lock = (
      JSON.parse(readFileSync(join(ROOT, 'data/sources.lock.json'), 'utf8')) as { sources: { id: string }[] }
    ).sources;
    const { credits } = buildCredits(ROOT);
    const data = (JSON.parse(credits) as { data: { id: string; locked: boolean; license: string }[] }).data;
    for (const s of lock) expect(data.find((d) => d.id === s.id)?.locked, s.id).toBe(true);
    expect(data.some((d) => d.id === 'wikidata-poi' && !d.locked)).toBe(true);
    for (const d of data) expect(d.license, d.id).toBeTruthy();
  });
  it('merges 3-language attribution for locked sources', () => {
    const d = creditsData(
      [{ id: 'x', license: 'CC0-1.0', attribution: '出典：X', dataset: 'https://example.org/x' }],
      [
        {
          id: 'x',
          kind: 'data',
          title: 'X',
          license: 'CC0-1.0',
          attribution: { ja: '出典：X', en: 'Source: X', ko: '출처: X' },
        },
      ],
    );
    expect(d[0]).toMatchObject({
      id: 'x',
      url: 'https://example.org/x',
      attribution: { en: 'Source: X', ko: '출처: X' },
    });
  });
  it('collects runtime OSS licenses of the game (transitive, no workspace packages)', () => {
    const oss = ossPackages(join(ROOT, 'apps/game'));
    const names = oss.map((o) => o.name);
    for (const n of ['three', 'preact', '@preact/signals', 'idb-keyval', 'meshoptimizer', 'jolt-physics'])
      expect(names, n).toContain(n);
    expect(names.some((n) => n.startsWith('@sanpo/'))).toBe(false);
    expect(oss.find((o) => o.name === 'preact')?.license).toBe('MIT');
    expect(oss.every((o) => o.license !== 'UNKNOWN')).toBe(true);
  });
  it('ships every runtime dependency license text (M11-T05 — MIT/BSD/Apache/OFL notice condition)', () => {
    const txt = ossNotices(join(ROOT, 'apps/game'));
    for (const o of ossPackages(join(ROOT, 'apps/game')))
      expect(txt).toContain(`${o.name}@${o.version} — ${o.license}`);
    expect(txt).toContain('Permission is hereby granted, free of charge');
    expect(txt).toContain('SIL OPEN FONT LICENSE');
    expect(txt).toContain('Apache License');
  });
});
