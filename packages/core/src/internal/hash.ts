// hash32: 파트 목록 → 32-bit 결정론 해시(xxHash32 라운드·아발란시 계열). see docs/15-conventions.md §7
const PRIME2 = 0x85ebca77;
const PRIME3 = 0xc2b2ae3d;
const PRIME4 = 0x27d4eb2f;
const PRIME5 = 0x165667b1;

// 파트 종류 태그: "1"(문자열)과 1(숫자), -1(int32)과 0xFFFFFFFF(float 경로)가 충돌하지 않게 구분한다.
const TAG_STRING = 0x53545231;
const TAG_INT32 = 0x494e5431;
const TAG_FLOAT64 = 0x464c5431;

// float64 비트 추출용(리틀엔디언 고정 → 플랫폼 무관). 모듈 전역 1개로 할당 회피.
const f64View = new DataView(new ArrayBuffer(8));

function round(h: number, word: number): number {
  const x = (h + Math.imul(word, PRIME3)) | 0;
  return Math.imul((x << 17) | (x >>> 15), PRIME4);
}

function avalanche(h: number): number {
  let x = h;
  x ^= x >>> 15;
  x = Math.imul(x, PRIME2);
  x ^= x >>> 13;
  x = Math.imul(x, PRIME3);
  x ^= x >>> 16;
  return x >>> 0;
}

function mixString(h0: number, s: string): number {
  let h = round(h0, TAG_STRING);
  const n = s.length;
  let i = 0;
  // UTF-16 코드 유닛 2개씩 한 워드로.
  for (; i + 1 < n; i += 2) h = round(h, s.charCodeAt(i) | (s.charCodeAt(i + 1) << 16));
  if (i < n) h = round(h, s.charCodeAt(i));
  return round(h, n);
}

function mixNumber(h0: number, v: number): number {
  if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
    return round(round(h0, TAG_INT32), v | 0);
  }
  f64View.setFloat64(0, v, true);
  const h = round(h0, TAG_FLOAT64);
  return round(round(h, f64View.getUint32(0, true)), f64View.getUint32(4, true));
}

/**
 * 파트(문자열·숫자) 순서열의 32-bit 부호 없는 해시. 동일 입력 → 모든 플랫폼에서 동일 출력.
 * 절차 시드 규칙: `createRng(hash32(WORLD_SEED, cellId, layer, index))`.
 */
export function hash32(...parts: Array<string | number>): number {
  let h = PRIME5;
  for (const p of parts) h = typeof p === 'string' ? mixString(h, p) : mixNumber(h, p);
  return avalanche((h + parts.length) | 0);
}
