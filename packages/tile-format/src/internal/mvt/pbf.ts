// 최소 protobuf 읽기·쓰기(MVT·PMTiles 디렉터리용): varint·zigzag·길이 구분 필드. 할당은 쓰기 버퍼 확장뿐.
export class PbfWriter {
  private buf = new Uint8Array(1024);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.pos + n) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.buf.subarray(0, this.pos));
    this.buf = b;
  }

  varint(v: number): void {
    this.ensure(10);
    let n = v;
    while (n >= 0x80) {
      this.buf[this.pos++] = (n & 0x7f) | 0x80;
      n = Math.floor(n / 128);
    }
    this.buf[this.pos++] = n;
  }

  tag(field: number, wire: number): void {
    this.varint((field << 3) | wire);
  }

  bytes(b: Uint8Array): void {
    this.varint(b.length);
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  string(s: string): void {
    this.bytes(new TextEncoder().encode(s));
  }

  double(v: number): void {
    this.ensure(8);
    new DataView(this.buf.buffer).setFloat64(this.pos, v, true);
    this.pos += 8;
  }

  /** 필드 field에 길이 구분 메시지(쓰기 함수로 채움). */
  message(field: number, write: (w: PbfWriter) => void): void {
    const sub = new PbfWriter();
    write(sub);
    this.tag(field, 2);
    this.bytes(sub.finish());
  }

  packed(field: number, values: readonly number[]): void {
    const sub = new PbfWriter();
    for (const v of values) sub.varint(v);
    this.tag(field, 2);
    this.bytes(sub.finish());
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export const zigzag = (n: number): number => (n << 1) ^ (n >> 31);
export const unzigzag = (n: number): number => (n >>> 1) ^ -(n & 1);

export class PbfReader {
  pos = 0;
  readonly buf: Uint8Array;
  private readonly end: number;
  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.end = buf.length;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }

  varint(): number {
    let result = 0;
    let mul = 1;
    for (;;) {
      const b = this.buf[this.pos++] as number;
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
      if (this.pos > this.end) throw new Error('pbf: truncated varint');
    }
  }

  /** (field, wire). */
  tag(): [number, number] {
    const t = this.varint();
    return [t >>> 3, t & 7];
  }

  bytes(): Uint8Array {
    const n = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  double(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset).getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  float(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset).getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  packed(): number[] {
    const b = this.bytes();
    const r = new PbfReader(b);
    const out: number[] = [];
    while (!r.done) out.push(r.varint());
    return out;
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`pbf: wire type ${wire}`);
  }
}
