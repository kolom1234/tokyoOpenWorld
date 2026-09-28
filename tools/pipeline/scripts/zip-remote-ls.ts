// 원격 zip의 중앙 디렉터리만 HTTP Range로 읽어 항목 이름·크기를 출력(전체 다운로드 없이 어떤 3차 메시가 들었는지 확인용).
// 사용: node tools/pipeline/scripts/zip-remote-ls.ts <url> [grep-regex]
const url = process.argv[2];
const filter = process.argv[3] ? new RegExp(process.argv[3]) : undefined;
if (!url) throw new Error('usage: zip-remote-ls <url> [regex]');

async function range(start: number, end: number): Promise<Buffer> {
  const res = await fetch(url as string, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const head = await fetch(url, { method: 'HEAD' });
const size = Number(head.headers.get('content-length'));
const tail = await range(Math.max(0, size - 65_600), size - 1);
const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) throw new Error('EOCD not found');
let cdSize = tail.readUInt32LE(eocd + 12);
let cdOff = tail.readUInt32LE(eocd + 16);
if (cdOff === 0xffffffff || cdSize === 0xffffffff) {
  const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
  const z64Off = Number(tail.readBigUInt64LE(loc + 8));
  const z64 = await range(z64Off, z64Off + 55);
  cdSize = Number(z64.readBigUInt64LE(40));
  cdOff = Number(z64.readBigUInt64LE(48));
}
const cd = await range(cdOff, cdOff + cdSize - 1);
let p = 0;
let total = 0;
while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
  const nameLen = cd.readUInt16LE(p + 28);
  const extraLen = cd.readUInt16LE(p + 30);
  const commentLen = cd.readUInt16LE(p + 32);
  let comp = cd.readUInt32LE(p + 20);
  let uncomp = cd.readUInt32LE(p + 24);
  const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
  // zip64 extra: 0x0001 → uncomp, comp(필요한 것만 순서대로)
  let e = p + 46 + nameLen;
  const eEnd = e + extraLen;
  while (e + 4 <= eEnd) {
    const id = cd.readUInt16LE(e);
    const len = cd.readUInt16LE(e + 2);
    if (id === 1) {
      let q = e + 4;
      if (uncomp === 0xffffffff) {
        uncomp = Number(cd.readBigUInt64LE(q));
        q += 8;
      }
      if (comp === 0xffffffff) comp = Number(cd.readBigUInt64LE(q));
    }
    e += 4 + len;
  }
  if (!filter || filter.test(name)) {
    process.stdout.write(`${uncomp}\t${comp}\t${name}\n`);
    total += comp;
  }
  p += 46 + nameLen + extraLen + commentLen;
}
process.stderr.write(`matched compressed bytes: ${total}\n`);
