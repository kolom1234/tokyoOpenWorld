// props.inst(M05-T03): 왕복(여러 종류·순서 유지), 길이 부족·빈 배치·비유한 거부, 인코더 입력 검사.
import { describe, expect, it } from 'vitest';
import { PROP_TYPE, parseProps, TkcErrorCode, writeProps } from '../src/index.ts';

describe('props.inst', () => {
  it('round-trips batches in order', () => {
    const batches = [
      { typeId: PROP_TYPE.utilityPole, transforms: Float32Array.from([1, 2, 3, 0.5, 1, 4, 5, 6, -1, 1.1]) },
      { typeId: PROP_TYPE.vendingMachine, transforms: Float32Array.from([10, 11, 12, 3.1, 1]) },
    ];
    const bytes = writeProps(batches);
    expect(bytes.byteLength).toBe(2 * 8 + 15 * 4);
    const r = parseProps(bytes);
    expect(r.ok && r.value).toEqual(batches);
  });

  it('rejects truncated, empty and non-finite batches', () => {
    const bytes = writeProps([{ typeId: 1, transforms: Float32Array.from([1, 2, 3, 4, 5]) }]);
    expect(parseProps(bytes.subarray(0, 10))).toMatchObject({ ok: false, error: { code: TkcErrorCode.Truncated } });
    const empty = new Uint8Array(8);
    expect(parseProps(empty)).toMatchObject({ ok: false, error: { code: TkcErrorCode.Corrupt } });
    const bad = bytes.slice();
    new DataView(bad.buffer).setFloat32(8, Number.NaN, true);
    expect(parseProps(bad)).toMatchObject({ ok: false, error: { code: TkcErrorCode.Corrupt } });
    expect(() => writeProps([{ typeId: 1, transforms: new Float32Array(4) }])).toThrow(RangeError);
    expect(parseProps(new Uint8Array(0))).toEqual({ ok: true, value: [] });
  });
});
