// Mapbox Vector Tile 2.1 인코더·디코더(M10-T03 지도): Tile.layers(3) → Layer{version 2, name, features, keys, values, extent}, 기하 = MoveTo·LineTo·ClosePath 명령 + zigzag 차분.
// 디코더는 우리 인코더 출력과 일반 MVT(문자열·실수·정수·불 값) 모두 읽는다.
import type { MvtFeature, MvtGeomType, MvtLayer } from '../../api-map.ts';
import { PbfReader, PbfWriter, unzigzag, zigzag } from './pbf.ts';

const cmd = (id: number, count: number): number => (id & 7) | (count << 3);

/** 피처 기하 → 명령 배열(커서는 피처마다 0에서). */
export function encodeGeometry(type: MvtGeomType, parts: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  const push = (x: number, y: number) => {
    out.push(zigzag(x - cx), zigzag(y - cy));
    cx = x;
    cy = y;
  };
  if (type === 1) {
    const pts = parts.flatMap((p) => [...p]);
    out.push(cmd(1, pts.length / 2));
    for (let i = 0; i < pts.length; i += 2) push(pts[i] as number, pts[i + 1] as number);
    return out;
  }
  for (const p of parts) {
    const n = p.length / 2;
    if (n < (type === 3 ? 3 : 2)) continue;
    out.push(cmd(1, 1));
    push(p[0] as number, p[1] as number);
    out.push(cmd(2, n - 1));
    for (let i = 2; i < p.length; i += 2) push(p[i] as number, p[i + 1] as number);
    if (type === 3) out.push(cmd(7, 1));
  }
  return out;
}

export function decodeGeometry(type: MvtGeomType, cmds: readonly number[]): number[][] {
  const parts: number[][] = [];
  let cur: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < cmds.length; ) {
    const c = cmds[i++] as number;
    const id = c & 7;
    const count = c >>> 3;
    if (id === 7) {
      continue;
    }
    for (let k = 0; k < count; k++) {
      x += unzigzag(cmds[i++] as number);
      y += unzigzag(cmds[i++] as number);
      if (id === 1 && type !== 1 && cur.length > 0) {
        parts.push(cur);
        cur = [];
      }
      cur.push(x, y);
    }
  }
  if (cur.length > 0) parts.push(cur);
  return parts;
}

type Value = string | number | boolean;

function writeValue(w: PbfWriter, v: Value): void {
  if (typeof v === 'string') {
    w.tag(1, 2);
    w.string(v);
  } else if (typeof v === 'boolean') {
    w.tag(7, 0);
    w.varint(v ? 1 : 0);
  } else if (Number.isInteger(v)) {
    w.tag(6, 0);
    w.varint(zigzag(v));
  } else {
    w.tag(3, 1);
    w.double(v);
  }
}

function encodeLayer(w: PbfWriter, layer: MvtLayer): void {
  const keys: string[] = [];
  const keyIdx = new Map<string, number>();
  const values: Value[] = [];
  const valIdx = new Map<string, number>();
  const idx = <T>(list: T[], map: Map<string, number>, k: string, v: T): number => {
    let i = map.get(k);
    if (i === undefined) {
      i = list.length;
      list.push(v);
      map.set(k, i);
    }
    return i;
  };
  w.tag(15, 0);
  w.varint(2);
  w.tag(1, 2);
  w.string(layer.name);
  for (const f of layer.features) {
    const geom = encodeGeometry(f.type, f.geometry);
    if (geom.length === 0) continue;
    const tags: number[] = [];
    for (const [k, v] of Object.entries(f.properties))
      tags.push(idx(keys, keyIdx, k, k), idx(values, valIdx, `${typeof v}:${v}`, v));
    w.message(2, (fw) => {
      if (f.id !== undefined) {
        fw.tag(1, 0);
        fw.varint(f.id);
      }
      if (tags.length > 0) fw.packed(2, tags);
      fw.tag(3, 0);
      fw.varint(f.type);
      fw.packed(4, geom);
    });
  }
  for (const k of keys) {
    w.tag(3, 2);
    w.string(k);
  }
  for (const v of values) w.message(4, (vw) => writeValue(vw, v));
  w.tag(5, 0);
  w.varint(layer.extent);
}

export function encodeMvt(layers: readonly MvtLayer[]): Uint8Array {
  const w = new PbfWriter();
  for (const l of layers) if (l.features.length > 0) w.message(3, (lw) => encodeLayer(lw, l));
  return w.finish();
}

function readValue(r: PbfReader): Value {
  let v: Value = '';
  while (!r.done) {
    const [f, wire] = r.tag();
    if (f === 1) v = r.string();
    else if (f === 2) v = r.float();
    else if (f === 3) v = r.double();
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) v = unzigzag(r.varint());
    else if (f === 7) v = r.varint() !== 0;
    else r.skip(wire);
  }
  return v;
}

interface RawFeature {
  id?: number;
  tags: number[];
  type: MvtGeomType;
  geom: number[];
}

function readFeature(r: PbfReader): RawFeature {
  const f: RawFeature = { tags: [], type: 1, geom: [] };
  while (!r.done) {
    const [field, wire] = r.tag();
    if (field === 1) f.id = r.varint();
    else if (field === 2) f.tags = r.packed();
    else if (field === 3) f.type = r.varint() as MvtGeomType;
    else if (field === 4) f.geom = r.packed();
    else r.skip(wire);
  }
  return f;
}

function readLayer(r: PbfReader): MvtLayer {
  let name = '';
  let extent = 4096;
  const keys: string[] = [];
  const values: Value[] = [];
  const raw: RawFeature[] = [];
  while (!r.done) {
    const [field, wire] = r.tag();
    if (field === 1) name = r.string();
    else if (field === 2) raw.push(readFeature(new PbfReader(r.bytes())));
    else if (field === 3) keys.push(r.string());
    else if (field === 4) values.push(readValue(new PbfReader(r.bytes())));
    else if (field === 5) extent = r.varint();
    else r.skip(wire);
  }
  const features: MvtFeature[] = raw.map((f) => {
    const properties: Record<string, Value> = {};
    for (let i = 0; i + 1 < f.tags.length; i += 2)
      properties[keys[f.tags[i] as number] ?? ''] = values[f.tags[i + 1] as number] ?? '';
    return {
      type: f.type,
      geometry: decodeGeometry(f.type, f.geom),
      properties,
      ...(f.id !== undefined ? { id: f.id } : {}),
    };
  });
  return { name, extent, features };
}

export function decodeMvt(bytes: Uint8Array): MvtLayer[] {
  const r = new PbfReader(bytes);
  const out: MvtLayer[] = [];
  while (!r.done) {
    const [field, wire] = r.tag();
    if (field === 3) out.push(readLayer(new PbfReader(r.bytes())));
    else r.skip(wire);
  }
  return out;
}
