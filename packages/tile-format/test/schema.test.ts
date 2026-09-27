// JSON Schema 일치: writer 헤더 ↔ schemas/cell-header, meta.json ↔ schemas/cell-meta (ajv, 테스트 전용). see docs/05-tile-format.md §3–4
import Ajv2020 from 'ajv/dist/2020.js';
import { beforeAll, describe, expect, it } from 'vitest';
import cellHeaderSchema from '../../../schemas/cell-header.schema.json' with { type: 'json' };
import cellMetaSchema from '../../../schemas/cell-meta.schema.json' with { type: 'json' };
import { type CellMeta, gunzip, readTkc, SECTION_REGISTRY, type SectionType, writeTkc } from '../src/index.ts';
import { HEADER, META, noise, sections } from './fixtures.ts';

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validateHeader = ajv.compile(cellHeaderSchema);
const validateMeta = ajv.compile(cellMetaSchema);

function headerJson(tkc: Uint8Array): unknown {
  const len = new DataView(tkc.buffer, tkc.byteOffset).getUint32(8, true);
  return JSON.parse(new TextDecoder().decode(tkc.subarray(16, 16 + len)));
}

let tkc: Uint8Array;
beforeAll(async () => {
  tkc = writeTkc(HEADER, await sections());
});

describe('cell header ↔ schemas/cell-header.schema.json', () => {
  it('writer output validates', () => {
    const ok = validateHeader(headerJson(tkc));
    expect(validateHeader.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('validates for every level and every registered section type', () => {
    for (const level of [0, 1, 2, 3] as const) {
      const types = (Object.keys(SECTION_REGISTRY) as SectionType[]).filter((t) =>
        (SECTION_REGISTRY[t].levels as readonly number[]).includes(level),
      );
      const secs = types.map((type, i) => ({ type, sources: ['src-a'], data: noise(i * 7, type) }));
      const header = { ...HEADER, cell: { level, ix: -3, iz: 2 } };
      expect(validateHeader(headerJson(writeTkc(header, secs))), JSON.stringify(validateHeader.errors)).toBe(true);
    }
  });

  it('schema codec enum equals the registry codec set', () => {
    const codecEnum = cellHeaderSchema.properties.sections.items.properties.codec.enum;
    const registry = new Set(Object.values(SECTION_REGISTRY).map((s) => s.codec));
    expect(new Set(codecEnum)).toEqual(registry);
  });

  it('schema and reader agree on misaligned offsets and bad hashes', () => {
    const h = headerJson(tkc) as { sections: Array<Record<string, unknown>> };
    const s0 = h.sections[0] ?? {};
    expect(validateHeader({ ...h, sections: [{ ...s0, offset: 24 }] })).toBe(false);
    expect(validateHeader({ ...h, sections: [{ ...s0, hash: 'xxh64:XYZ' }] })).toBe(false);
  });
});

describe('meta.json ↔ schemas/cell-meta.schema.json', () => {
  it('synthetic CellMeta validates and survives json+gzip in the TKC', async () => {
    expect(validateMeta(META), JSON.stringify(validateMeta.errors)).toBe(true);
    const r = readTkc(tkc);
    if (!r.ok) throw new Error(r.error.message);
    const raw = r.value.section('meta.json');
    if (!raw) throw new Error('meta.json missing');
    const json = await gunzip(raw);
    if (!json.ok) throw new Error(json.error.message);
    const meta = JSON.parse(new TextDecoder().decode(json.value)) as CellMeta;
    expect(meta).toEqual(META);
    expect(validateMeta(meta)).toBe(true);
  });
});
