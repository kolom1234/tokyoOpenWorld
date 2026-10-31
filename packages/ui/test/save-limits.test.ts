// 세이브 가져오기 상한(ADR-0103): 배열 길이·썸네일 합계 초과 = too_many(마이그레이션 전), 형식 아님 = invalid, 정상 상한 경계는 통과. 사유별 안내 문구.
import { describe, expect, it } from 'vitest';
import { SAVE_LIMITS, SaveImportError } from '../src/internal/save/limits.ts';
import { readSaveExport } from '../src/internal/save/migrations.ts';
import { importNote } from '../src/internal/screens/save-section.tsx';

const THUMB = `data:image/jpeg;base64,${'A'.repeat(64)}`;
const file = (save: Record<string, unknown>, thumbs: Record<string, string> = {}) =>
  JSON.stringify({ format: 'tokyo-sanpo-save', save: { v: 2, ...save }, settings: {}, thumbs });
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, atMs: i, poiId: null }));
const thumbsOf = (n: number, url = THUMB) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, url]));

describe('save import limits', () => {
  it('accepts a save exactly at the photo limit', () => {
    const r = readSaveExport(file({ photos: photos(SAVE_LIMITS.photos) }, thumbsOf(SAVE_LIMITS.photos)));
    expect(r.ok && r.value.save.photos.length).toBe(SAVE_LIMITS.photos);
    expect(r.ok && Object.keys(r.value.thumbs).length).toBe(SAVE_LIMITS.photos);
  });

  it('rejects over-limit arrays and thumbnails as too_many before migrating', () => {
    const over = [
      file({ photos: photos(SAVE_LIMITS.photos + 1) }),
      file({ discoveries: Array.from({ length: SAVE_LIMITS.discoveries + 1 }, (_, i) => ({ id: `d${i}` })) }),
      file({ v: 1, discovered: Array.from({ length: SAVE_LIMITS.discoveries + 1 }, (_, i) => `d${i}`) }),
      file({ unlocked: Array.from({ length: SAVE_LIMITS.unlocked + 1 }, (_, i) => `u${i}`) }),
      file({
        discoveries: [{ id: 'd', photoIds: Array.from({ length: SAVE_LIMITS.photoIdsPerDiscovery + 1 }, () => 'p') }],
      }),
      file({}, thumbsOf(SAVE_LIMITS.photos + 1)),
      file({}, { p0: `data:image/jpeg;base64,${'A'.repeat(SAVE_LIMITS.thumbChars)}` }),
      file({}, thumbsOf(30, `data:image/jpeg;base64,${'A'.repeat(SAVE_LIMITS.thumbTotalChars / 25)}`)),
    ];
    for (const text of over) expect(readSaveExport(text)).toEqual({ ok: false, error: 'too_many' });
  });

  it('keeps invalid for non-saves and too_large for oversize text', () => {
    expect(readSaveExport('not json')).toEqual({ ok: false, error: 'invalid' });
    expect(readSaveExport('{"format":"other"}')).toEqual({ ok: false, error: 'invalid' });
    expect(readSaveExport(' '.repeat(SAVE_LIMITS.fileBytes + 1))).toEqual({ ok: false, error: 'too_large' });
  });

  it('tells the player why an import failed', () => {
    expect(importNote(new SaveImportError('too_large'))).toContain('24');
    expect(importNote(new SaveImportError('too_many'))).toContain(String(SAVE_LIMITS.photos));
    expect(importNote(new Error('x'))).toBe(importNote(new SaveImportError('invalid')));
    expect(
      new Set([
        importNote(new SaveImportError('too_large')),
        importNote(new SaveImportError('too_many')),
        importNote(1),
      ]).size,
    ).toBe(3);
  });
});
