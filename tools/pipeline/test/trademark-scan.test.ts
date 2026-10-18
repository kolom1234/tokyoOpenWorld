// M11-T05 실존 상표 스캔: 화면에 나오는 글(UI 3개 언어·명소 이름·설명·역 안내·간판 가상 브랜드)에 content/signage/real-brands.txt의 실존 상호·상표가 없다.
// 라틴 이름은 단어 경계로(“can only” ≠ Canon), 일본어 이름은 정규화(NFKC·히라가나) 포함으로 본다. 철도 노선·역·지명은 사실 표기라 대상 밖(목록에 없음).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeName } from '../src/stages/signage/brand-generator.ts';

const REPO = join(import.meta.dirname, '../../..');
const reals = readFileSync(join(REPO, 'content/signage/real-brands.txt'), 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

function hitsIn(texts: readonly string[]): string[] {
  const hits: string[] = [];
  for (const r of reals) {
    const latin = /^[\x20-\x7e]+$/.test(r);
    const esc = r.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = latin ? new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`) : null;
    const nr = normalizeName(r);
    if (!latin && nr.length < 3) continue;
    for (const t of texts)
      if (re ? re.test(t.toLowerCase()) : normalizeName(t).includes(nr)) hits.push(`${r} ← ${t.slice(0, 60)}`);
  }
  return hits;
}

const json = (p: string): unknown => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

describe('trademark scan (M11-T05)', () => {
  it('detects real names (control) but not words that merely contain them', () => {
    expect(hitsIn(['Starbucks Reserve', 'スターバックス前'])).toHaveLength(2);
    expect(hitsIn(['You can only fast-travel', 'gaps in the fence'])).toEqual([]);
  });
  it('UI text in ja·en·ko has no real brand names', () => {
    const dir = 'packages/ui/src/internal/i18n';
    const texts = readdirSync(join(REPO, dir))
      .filter((n) => n.endsWith('.json'))
      .flatMap((n) => strings(json(`${dir}/${n}`)));
    expect(texts.length).toBeGreaterThan(300);
    expect(hitsIn(texts)).toEqual([]);
  });
  it('POI names and self-written descriptions, station guides and fictional brands have no real brand names', () => {
    const texts = [
      ...strings(json('content/poi/pois.json')),
      ...readdirSync(join(REPO, 'content/stations'))
        .filter((n) => n.endsWith('.json'))
        .flatMap((n) => strings(json(`content/stations/${n}`))),
      ...strings(json('content/signage/brands.json')),
    ];
    expect(texts.length).toBeGreaterThan(100);
    expect(hitsIn(texts)).toEqual([]);
  });
});
