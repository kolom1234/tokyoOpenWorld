// PLATEAU 都市設備(frn) LOD3 道路標示 리더(M06 사전 2): `frn:CityFurniture` 중 function 1xxx(道路標示 — 1010 区画線·1020 車道中央線·1030 車線境界線·
// 1040 車道外側線·1110 横断歩道·1120 停止線·1200 規制標示)의 lod3Geometry 면(측량 기반, 삼각형) → WF. 05 §, see docs/adr/0058-plateau-crosswalks.md
// 다른 frn(전신주·표지 등)은 건너뛴다. saxes 스트리밍(1 MiB 청크), 접두사 문자열 비교(PLATEAU 표준 접두사 고정).
import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
import { latLonHToWF, parsePosList } from './geometry.ts';

/** 道路標示 코드(CityFurniture_function). */
export const MARKING_CODES = {
  laneLine: '1010',
  centerLine: '1020',
  laneBoundary: '1030',
  edgeLine: '1040',
  crosswalk: '1110',
  stopLine: '1120',
  regulatory: '1200',
} as const;

export interface MarkingRecord {
  layer: 'markings';
  /** gml:id. */
  id: string;
  /** CityFurniture_function 코드(1xxx). */
  function: string;
  /** 면 링(WF x, y, z 반복, 닫힘점 제거). */
  polygonsWF: number[][];
  source: string;
}

const isMarking = (code: string): boolean => /^1\d{3}$/.test(code);

interface Ctx {
  id: string;
  fn: string;
  polys: number[][];
}

export function createMarkingParser(source: string, emit: (r: MarkingRecord) => void): SaxesParser {
  const parser = new SaxesParser({ xmlns: false });
  let cur: Ctx | null = null;
  let inLod3 = 0;
  let textOf: 'fn' | 'pos' | null = null;
  let buf = '';
  parser.on('opentag', (tag) => {
    const n = tag.name;
    if (n === 'frn:CityFurniture') cur = { id: String(tag.attributes['gml:id'] ?? ''), fn: '', polys: [] };
    else if (!cur) return;
    else if (n === 'frn:function') textOf = 'fn';
    else if (n === 'frn:lod3Geometry') inLod3++;
    else if (n === 'gml:posList' && inLod3 > 0) textOf = 'pos';
    buf = '';
  });
  parser.on('text', (t) => {
    if (textOf) buf += t;
  });
  parser.on('closetag', (tag) => {
    const n = tag.name;
    const c = cur;
    if (!c) return;
    if (n === 'frn:function' && textOf === 'fn') {
      c.fn = buf.trim();
      textOf = null;
    } else if (n === 'gml:posList' && textOf === 'pos') {
      const v = parsePosList(buf);
      const ring = v ? latLonHToWF(v) : [];
      if (ring.length >= 9) c.polys.push(ring);
      textOf = null;
    } else if (n === 'frn:lod3Geometry') inLod3--;
    else if (n === 'frn:CityFurniture') {
      if (isMarking(c.fn) && c.polys.length > 0)
        emit({ layer: 'markings', id: c.id, function: c.fn, polygonsWF: c.polys, source });
      cur = null;
    }
  });
  parser.on('error', (e) => {
    throw e;
  });
  return parser;
}

/** frn GML 파일 → 道路標示 레코드(스트리밍). */
export async function* readMarkings(file: string, source: string): AsyncIterable<MarkingRecord> {
  const queue: MarkingRecord[] = [];
  const parser = createMarkingParser(source, (r) => queue.push(r));
  for await (const chunk of createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    parser.write(chunk as string);
    yield* queue.splice(0);
  }
  parser.close();
  yield* queue.splice(0);
}

/** 문자열 → 레코드(테스트용). */
export function parseMarkingsString(xml: string, source: string): MarkingRecord[] {
  const out: MarkingRecord[] = [];
  createMarkingParser(source, (r) => out.push(r))
    .write(xml)
    .close();
  return out;
}
