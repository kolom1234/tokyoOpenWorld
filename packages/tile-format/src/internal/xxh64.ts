// XXH64(seed 0) — 섹션 해시·cells.idx hash32. BigInt 없이 u32 hi/lo 쌍 연산(파이프라인 처리량). see docs/05-tile-format.md §3, §5

// XXH64 소수(hi, lo). 출처: xxHash 명세 XXH_PRIME64_1..5.
const P1H = 0x9e3779b1;
const P1L = 0x85ebca87;
const P2H = 0xc2b2ae3d;
const P2L = 0x27d4eb4f;
const P3H = 0x165667b1;
const P3L = 0x9e3779f9;
const P4H = 0x85ebca77;
const P4L = 0xc2b2ae63;
const P5H = 0x27d4eb2f;
const P5L = 0x165667c5;
const STRIPE = 32;
const TWO32 = 0x1_0000_0000;

// 결과 레지스터(할당 회피). 모든 연산은 RH:RL(부호 없는 u32 쌍)에 결과를 쓴다.
let RH = 0;
let RL = 0;

function mul64(ah: number, al: number, bh: number, bl: number): void {
  const a0 = al & 0xffff;
  const a1 = al >>> 16;
  const b0 = bl & 0xffff;
  const b1 = bl >>> 16;
  const p00 = a0 * b0;
  const p01 = a0 * b1;
  const p10 = a1 * b0;
  const mid = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
  const lo = (((mid & 0xffff) << 16) | (p00 & 0xffff)) >>> 0;
  const hi = a1 * b1 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16);
  RH = (hi + Math.imul(al, bh) + Math.imul(ah, bl)) >>> 0;
  RL = lo;
}

function add64(ah: number, al: number, bh: number, bl: number): void {
  const lo = al + bl;
  RL = lo >>> 0;
  RH = (ah + bh + (lo >= TWO32 ? 1 : 0)) >>> 0;
}

function rotl64(h0: number, l0: number, r0: number): void {
  let h = h0;
  let l = l0;
  let r = r0;
  if (r >= 32) {
    h = l0;
    l = h0;
    r -= 32;
  }
  if (r === 0) {
    RH = h;
    RL = l;
    return;
  }
  RH = ((h << r) | (l >>> (32 - r))) >>> 0;
  RL = ((l << r) | (h >>> (32 - r))) >>> 0;
}

/** acc = rotl(acc + input·P2, 31)·P1 */
function round(accH: number, accL: number, inH: number, inL: number): void {
  mul64(inH, inL, P2H, P2L);
  add64(accH, accL, RH, RL);
  rotl64(RH, RL, 31);
  mul64(RH, RL, P1H, P1L);
}

/** acc = (acc ^ round(0, val))·P1 + P4 */
function mergeRound(accH: number, accL: number, vH: number, vL: number): void {
  round(0, 0, vH, vL);
  mul64((accH ^ RH) >>> 0, (accL ^ RL) >>> 0, P1H, P1L);
  add64(RH, RL, P4H, P4L);
}

// 초기 레인 v1 = P1+P2, v4 = −P1 (seed 0).
add64(P1H, P1L, P2H, P2L);
const V1H = RH;
const V1L = RL;
const V4H = ~P1H >>> 0;
const V4L = (TWO32 - P1L) >>> 0;

function stripes(dv: DataView, end: number): void {
  let [ah, al, bh, bl, ch, cl, dh, dl] = [V1H, V1L, P2H, P2L, 0, 0, V4H, V4L];
  for (let p = 0; p + STRIPE <= end; p += STRIPE) {
    round(ah, al, dv.getUint32(p + 4, true), dv.getUint32(p, true));
    [ah, al] = [RH, RL];
    round(bh, bl, dv.getUint32(p + 12, true), dv.getUint32(p + 8, true));
    [bh, bl] = [RH, RL];
    round(ch, cl, dv.getUint32(p + 20, true), dv.getUint32(p + 16, true));
    [ch, cl] = [RH, RL];
    round(dh, dl, dv.getUint32(p + 28, true), dv.getUint32(p + 24, true));
    [dh, dl] = [RH, RL];
  }
  rotl64(ah, al, 1);
  let [hh, hl] = [RH, RL];
  rotl64(bh, bl, 7);
  add64(hh, hl, RH, RL);
  [hh, hl] = [RH, RL];
  rotl64(ch, cl, 12);
  add64(hh, hl, RH, RL);
  [hh, hl] = [RH, RL];
  rotl64(dh, dl, 18);
  add64(hh, hl, RH, RL);
  mergeRound(RH, RL, ah, al);
  mergeRound(RH, RL, bh, bl);
  mergeRound(RH, RL, ch, cl);
  mergeRound(RH, RL, dh, dl);
}

function tail(dv: DataView, start: number, end: number): void {
  let p = start;
  for (; p + 8 <= end; p += 8) {
    const [hh, hl] = [RH, RL];
    round(0, 0, dv.getUint32(p + 4, true), dv.getUint32(p, true));
    rotl64((hh ^ RH) >>> 0, (hl ^ RL) >>> 0, 27);
    mul64(RH, RL, P1H, P1L);
    add64(RH, RL, P4H, P4L);
  }
  if (p + 4 <= end) {
    const [hh, hl] = [RH, RL];
    mul64(0, dv.getUint32(p, true), P1H, P1L);
    rotl64((hh ^ RH) >>> 0, (hl ^ RL) >>> 0, 23);
    mul64(RH, RL, P2H, P2L);
    add64(RH, RL, P3H, P3L);
    p += 4;
  }
  for (; p < end; p++) {
    const [hh, hl] = [RH, RL];
    mul64(0, dv.getUint8(p), P5H, P5L);
    rotl64((hh ^ RH) >>> 0, (hl ^ RL) >>> 0, 11);
    mul64(RH, RL, P1H, P1L);
  }
}

function avalanche(): void {
  RL = (RL ^ (RH >>> 1)) >>> 0; // h ^= h >> 33
  mul64(RH, RL, P2H, P2L);
  RL = (RL ^ ((RL >>> 29) | (RH << 3))) >>> 0; // h ^= h >> 29
  RH = (RH ^ (RH >>> 29)) >>> 0;
  mul64(RH, RL, P3H, P3L);
  RL = (RL ^ RH) >>> 0; // h ^= h >> 32
}

function digest(bytes: Uint8Array): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength;
  if (len >= STRIPE) {
    stripes(dv, len);
  } else {
    RH = P5H;
    RL = P5L;
  }
  add64(RH, RL, Math.floor(len / TWO32), len >>> 0);
  tail(dv, len - (len % STRIPE), len);
  avalanche();
}

/** XXH64(seed 0) 정규(big-endian) 16자리 소문자 hex. */
export function xxh64Hex(bytes: Uint8Array): string {
  digest(bytes);
  return RH.toString(16).padStart(8, '0') + RL.toString(16).padStart(8, '0');
}

/** XXH64(seed 0)의 하위 32비트(부호 없는 정수). */
export function xxh64Low32(bytes: Uint8Array): number {
  digest(bytes);
  return RL;
}
