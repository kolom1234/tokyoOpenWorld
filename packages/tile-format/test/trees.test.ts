// trees.inst(M05-T04): 왕복, 길이 불일치·species 0·비유한·높이 0 거부, 인코더 입력 검사.
import { describe, expect, it } from 'vitest';
import { parseTrees, TkcErrorCode, TREE_RECORD_BYTES, TREE_SPECIES, treeRecordAt, writeTrees } from '../src/index.ts';

const rec = (species: number, x: number) => ({ species, seed: 200, x, y: 15.5, z: -3, height: 12, crownR: 4 });

describe('trees.inst', () => {
  it('round-trips records', () => {
    const recs = [rec(TREE_SPECIES.zelkova, 1.5), rec(TREE_SPECIES.pine, 250)];
    const bytes = writeTrees(recs);
    expect(bytes.byteLength).toBe(4 + 2 * TREE_RECORD_BYTES);
    const r = parseTrees(bytes);
    if (!r.ok) throw new Error('parse');
    expect(r.value.count).toBe(2);
    expect([0, 1].map((i) => treeRecordAt(r.value, i))).toEqual(recs);
    expect(parseTrees(writeTrees([]))).toMatchObject({ ok: true, value: { count: 0 } });
  });

  it('rejects truncated and corrupt records', () => {
    const bytes = writeTrees([rec(1, 2)]);
    expect(parseTrees(bytes.subarray(0, 20))).toMatchObject({ ok: false, error: { code: TkcErrorCode.Truncated } });
    expect(parseTrees(new Uint8Array(2))).toMatchObject({ ok: false, error: { code: TkcErrorCode.Truncated } });
    const zero = bytes.slice();
    zero[4] = 0;
    expect(parseTrees(zero)).toMatchObject({ ok: false, error: { code: TkcErrorCode.Corrupt } });
    const nan = bytes.slice();
    new DataView(nan.buffer).setFloat32(4 + 16, Number.NaN, true);
    expect(parseTrees(nan)).toMatchObject({ ok: false, error: { code: TkcErrorCode.Corrupt } });
    expect(() => writeTrees([{ ...rec(1, 2), height: 0 }])).toThrow(RangeError);
  });
});
