// 최소 Shapefile 리더(e-Stat 소지역 경계 — M10-T02): .shp 폴리곤(유형 5, 링 여러 개) + .dbf 문자·숫자 필드(Shift_JIS). GDAL 없이 Node에서.
// 링 방향: 바깥 = 시계 방향(ESRI 규약), 구멍 = 반시계. 좌표는 파일 그대로(e-Stat coordSys=1 = JGD2011 경위도).
export interface ShpPolygon {
  /** 링마다 [x, y] 점(닫힘 — 첫 점 = 끝 점). */
  rings: [number, number][][];
}

export function readShpPolygons(buf: Uint8Array): ShpPolygon[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getInt32(0, false) !== 9994) throw new Error('shp: bad file code');
  const fileLen = v.getInt32(24, false) * 2;
  const out: ShpPolygon[] = [];
  let o = 100;
  while (o + 8 <= fileLen) {
    const contentLen = v.getInt32(o + 4, false) * 2;
    const c = o + 8;
    const type = v.getInt32(c, true);
    if (type === 5) {
      const numParts = v.getInt32(c + 36, true);
      const numPoints = v.getInt32(c + 40, true);
      const parts: number[] = [];
      for (let i = 0; i < numParts; i++) parts.push(v.getInt32(c + 44 + i * 4, true));
      const pts = c + 44 + numParts * 4;
      const rings: [number, number][][] = [];
      for (let p = 0; p < numParts; p++) {
        const end = p + 1 < numParts ? (parts[p + 1] as number) : numPoints;
        const ring: [number, number][] = [];
        for (let i = parts[p] as number; i < end; i++)
          ring.push([v.getFloat64(pts + i * 16, true), v.getFloat64(pts + i * 16 + 8, true)]);
        rings.push(ring);
      }
      out.push({ rings });
    } else out.push({ rings: [] });
    o = c + contentLen;
  }
  return out;
}

export type DbfRecord = Record<string, string>;

/** .dbf 레코드(삭제 표시 레코드 제외). 값은 앞뒤 공백을 지운 문자열. */
export function readDbf(buf: Uint8Array, encoding = 'shift_jis'): DbfRecord[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = v.getUint32(4, true);
  const headerLen = v.getUint16(8, true);
  const recLen = v.getUint16(10, true);
  const dec = new TextDecoder(encoding);
  const fields: { name: string; len: number }[] = [];
  for (let o = 32; buf[o] !== 0x0d && o < headerLen; o += 32) {
    const raw = buf.subarray(o, o + 11);
    const z = raw.indexOf(0);
    fields.push({ name: new TextDecoder('ascii').decode(raw.subarray(0, z < 0 ? 11 : z)), len: buf[o + 16] as number });
  }
  const out: DbfRecord[] = [];
  for (let i = 0; i < n; i++) {
    const r = headerLen + i * recLen;
    const rec: DbfRecord = {};
    let p = r + 1;
    for (const f of fields) {
      rec[f.name] = dec.decode(buf.subarray(p, p + f.len)).trim();
      p += f.len;
    }
    out.push(rec);
  }
  return out;
}
