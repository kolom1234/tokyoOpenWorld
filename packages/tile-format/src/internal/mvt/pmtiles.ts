// PMTiles v3 쓰기·읽기(M10-T03 `global/map.pmtiles`): 127 B 머리말 + 루트 디렉터리(gzip, 머리말과 함께 첫 16 KiB) + 메타데이터(gzip JSON) + (넘치면) 잎 디렉터리 + 타일(gzip MVT).
// 타일 id = 줌별 힐버트 곡선(공식 사양 zxyToTileId). 디렉터리 = varint 열 4개(id 차분·run·길이·오프셋(연속이면 0, 아니면 +1)). see https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
import type { PmtilesArchive, PmtilesHeader, PmtilesTileInput } from '../../api-map.ts';
import { gunzip, gzip } from '../gzip.ts';
import { PbfReader, PbfWriter } from './pbf.ts';

const HEADER_BYTES = 127;
const ROOT_MAX = 16384 - HEADER_BYTES;
const LEAF_ENTRIES = 4096;

export function zxyToTileId(z: number, x: number, y: number): number {
  let acc = 0;
  for (let a = 0; a < z; a++) acc += 4 ** a;
  const n = 2 ** z;
  let tx = x;
  let ty = y;
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0;
    const ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx;
        ty = s - 1 - ty;
      }
      [tx, ty] = [ty, tx];
    }
  }
  return acc + d;
}

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

function serializeDir(entries: readonly Entry[]): Uint8Array {
  const w = new PbfWriter();
  w.varint(entries.length);
  let last = 0;
  for (const e of entries) {
    w.varint(e.tileId - last);
    last = e.tileId;
  }
  for (const e of entries) w.varint(e.runLength);
  for (const e of entries) w.varint(e.length);
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    w.varint(i > 0 && prev && e.offset === prev.offset + prev.length ? 0 : e.offset + 1);
  });
  return w.finish();
}

function deserializeDir(bytes: Uint8Array): Entry[] {
  const r = new PbfReader(bytes);
  const n = r.varint();
  const out: Entry[] = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    id += r.varint();
    out.push({ tileId: id, offset: 0, length: 0, runLength: 0 });
  }
  for (const e of out) e.runLength = r.varint();
  for (const e of out) e.length = r.varint();
  out.forEach((e, i) => {
    const v = r.varint();
    const prev = out[i - 1];
    e.offset = v === 0 && prev ? prev.offset + prev.length : v - 1;
  });
  return out;
}

const u64 = (v: DataView, o: number, n: number) => v.setBigUint64(o, BigInt(n), true);
const e7 = (deg: number) => Math.round(deg * 1e7);

/** 루트(+잎) 디렉터리 — 루트가 넘치면 4096개씩 잎으로. */
async function directories(entries: Entry[]): Promise<{ root: Uint8Array; leaves: Uint8Array }> {
  const root = await gzip(serializeDir(entries));
  if (root.length <= ROOT_MAX) return { root, leaves: new Uint8Array(0) };
  const leafEntries: Entry[] = [];
  const parts: Uint8Array[] = [];
  let off = 0;
  for (let i = 0; i < entries.length; i += LEAF_ENTRIES) {
    const chunk = entries.slice(i, i + LEAF_ENTRIES);
    const leaf = await gzip(serializeDir(chunk));
    leafEntries.push({ tileId: (chunk[0] as Entry).tileId, offset: off, length: leaf.length, runLength: 0 });
    parts.push(leaf);
    off += leaf.length;
  }
  return { root: await gzip(serializeDir(leafEntries)), leaves: concat(parts) };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function writePmtiles(
  tiles: readonly PmtilesTileInput[],
  meta: { header: Omit<PmtilesHeader, 'tiles' | 'tileType' | 'tileCompression'>; metadata: Record<string, unknown> },
): Promise<Uint8Array> {
  const sorted = tiles.map((t) => ({ ...t, id: zxyToTileId(t.z, t.x, t.y) })).sort((a, b) => a.id - b.id);
  const data: Uint8Array[] = [];
  const entries: Entry[] = [];
  let off = 0;
  for (const t of sorted) {
    const z = await gzip(t.data);
    entries.push({ tileId: t.id, offset: off, length: z.length, runLength: 1 });
    data.push(z);
    off += z.length;
  }
  const { root, leaves } = await directories(entries);
  const metaBytes = await gzip(new TextEncoder().encode(JSON.stringify(meta.metadata)));
  const tileData = concat(data);
  const head = new Uint8Array(HEADER_BYTES);
  const v = new DataView(head.buffer);
  head.set(new TextEncoder().encode('PMTiles'), 0);
  head[7] = 3;
  const rootOff = HEADER_BYTES;
  const metaOff = rootOff + root.length;
  const leafOff = metaOff + metaBytes.length;
  const dataOff = leafOff + leaves.length;
  [rootOff, root.length, metaOff, metaBytes.length, leafOff, leaves.length, dataOff, tileData.length].forEach(
    (n, i) => {
      u64(v, 8 + i * 8, n);
    },
  );
  for (const o of [72, 80, 88]) u64(v, o, entries.length);
  head[96] = 1;
  head[97] = 2;
  head[98] = 2;
  head[99] = 1;
  const h = meta.header;
  head[100] = h.minZoom;
  head[101] = h.maxZoom;
  [h.bounds.west, h.bounds.south, h.bounds.east, h.bounds.north].forEach((d, i) => {
    v.setInt32(102 + i * 4, e7(d), true);
  });
  head[118] = h.center.zoom;
  v.setInt32(119, e7(h.center.lon), true);
  v.setInt32(123, e7(h.center.lat), true);
  return concat([head, root, metaBytes, leaves, tileData]);
}

const num = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function unz(b: Uint8Array): Promise<Uint8Array> {
  const r = await gunzip(b);
  if (!r.ok) throw new Error(`pmtiles: gunzip ${r.error.code}`);
  return r.value;
}

function findEntry(entries: readonly Entry[], id: number): Entry | undefined {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid] as Entry;
    if (id < e.tileId) hi = mid - 1;
    else if (id > e.tileId) lo = mid + 1;
    else return e;
  }
  const e = entries[hi];
  if (e && (e.runLength === 0 || id - e.tileId < e.runLength)) return e;
  return undefined;
}

/** 파일 전체(ArrayBuffer) → 아카이브. 내부 압축은 gzip·none만. */
export async function readPmtiles(buf: Uint8Array): Promise<PmtilesArchive> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (new TextDecoder().decode(buf.subarray(0, 7)) !== 'PMTiles' || buf[7] !== 3) throw new Error('pmtiles: not v3');
  const rootOff = num(v, 8);
  const rootLen = num(v, 16);
  const metaOff = num(v, 24);
  const metaLen = num(v, 32);
  const leafOff = num(v, 40);
  const dataOff = num(v, 56);
  const internalGzip = buf[97] === 2;
  const tileGzip = buf[98] === 2;
  const dec = (b: Uint8Array) => (internalGzip ? unz(b) : Promise.resolve(b));
  const root = deserializeDir(await dec(buf.subarray(rootOff, rootOff + rootLen)));
  const metadata = JSON.parse(new TextDecoder().decode(await dec(buf.subarray(metaOff, metaOff + metaLen)))) as Record<
    string,
    unknown
  >;
  const leafCache = new Map<number, Entry[]>();
  const header: PmtilesHeader = {
    minZoom: buf[100] as number,
    maxZoom: buf[101] as number,
    bounds: {
      west: v.getInt32(102, true) / 1e7,
      south: v.getInt32(106, true) / 1e7,
      east: v.getInt32(110, true) / 1e7,
      north: v.getInt32(114, true) / 1e7,
    },
    center: { zoom: buf[118] as number, lon: v.getInt32(119, true) / 1e7, lat: v.getInt32(123, true) / 1e7 },
    tileType: buf[99] === 1 ? 'mvt' : buf[99] === 2 ? 'png' : 'unknown',
    tileCompression: tileGzip ? 'gzip' : 'none',
    tiles: num(v, 72),
  };
  return {
    header,
    metadata,
    async tile(z, x, y) {
      const id = zxyToTileId(z, x, y);
      let dir = root;
      for (let depth = 0; depth < 4; depth++) {
        const e = findEntry(dir, id);
        if (!e) return undefined;
        if (e.runLength > 0) {
          const b = buf.subarray(dataOff + e.offset, dataOff + e.offset + e.length);
          return tileGzip ? unz(b) : b;
        }
        let leaf = leafCache.get(e.offset);
        if (!leaf) {
          leaf = deserializeDir(await dec(buf.subarray(leafOff + e.offset, leafOff + e.offset + e.length)));
          leafCache.set(e.offset, leaf);
        }
        dir = leaf;
      }
      return undefined;
    },
  };
}
