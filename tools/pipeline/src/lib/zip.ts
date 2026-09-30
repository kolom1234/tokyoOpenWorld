// 최소 ZIP 읽기(끝 레코드 → 중앙 디렉터리 → 저장·deflate 항목): 외부 에셋 zip에서 필요한 파일만 꺼낸다(아바타 M05). ZIP64·암호화 미지원.
// 외부 의존 없음(node:zlib). see PKWARE APPNOTE.TXT §4.3
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  /** 해제 크기(B). */
  readonly size: number;
  read(): Uint8Array<ArrayBuffer>;
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
/** 끝 레코드(22 B) + 최대 주석(65,535 B). */
const EOCD_SEARCH = 22 + 0xffff;

function findEocd(v: DataView): number {
  const min = Math.max(0, v.byteLength - EOCD_SEARCH);
  for (let i = v.byteLength - 22; i >= min; i--) if (v.getUint32(i, true) === EOCD_SIG) return i;
  throw new Error('zip: end of central directory not found');
}

function entryAt(buf: Uint8Array, v: DataView, p: number): { entry: ZipEntry; next: number } {
  if (v.getUint32(p, true) !== CDIR_SIG) throw new Error(`zip: bad central directory entry at ${p}`);
  const method = v.getUint16(p + 10, true);
  const compSize = v.getUint32(p + 20, true);
  const size = v.getUint32(p + 24, true);
  const nameLen = v.getUint16(p + 28, true);
  const extraLen = v.getUint16(p + 30, true);
  const commentLen = v.getUint16(p + 32, true);
  const local = v.getUint32(p + 42, true);
  const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
  const read = (): Uint8Array<ArrayBuffer> => {
    if (v.getUint32(local, true) !== LOCAL_SIG) throw new Error(`zip: bad local header for ${name}`);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) return data.slice();
    if (method === 8) return new Uint8Array(inflateRawSync(data));
    throw new Error(`zip: ${name}: compression method ${method} unsupported`);
  };
  return { entry: { name, size, read }, next: p + 46 + nameLen + extraLen + commentLen };
}

/** 항목 이름(경로, '/' 구분) → 항목. 디렉터리 항목(이름 끝 '/')은 뺀다. */
export function readZip(buf: Uint8Array): Map<string, ZipEntry> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = findEocd(v);
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    const { entry, next } = entryAt(buf, v, p);
    if (!entry.name.endsWith('/')) out.set(entry.name, entry);
    p = next;
  }
  return out;
}
