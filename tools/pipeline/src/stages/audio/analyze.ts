// 오디오 분석(M09-T04 — ADR-0079): 루프 구간 고르기용 "지속 음조" 점수와 발소리 온셋.
// 지속 음조 = 같은 주파수 칸에 6프레임(≈ 128 ms) 넘게 머무는 좁은 봉우리 — 신호 유도음·차임·안내 멜로디·음악·경적이 여기 걸린다.
// 웅성임(말소리)은 음높이가 계속 바뀌어 덜 걸린다. 사람 귀 검수(staging)를 대신하지 않는다 — 걸러 낼 후보를 줄일 뿐.

export const FFT_SIZE = 2048;
export const HOP = 1024;
/** 봉우리 판정: 주변 ±12칸 중앙값보다 이 dB 이상, 300 Hz–5 kHz. */
const PEAK_DB = 15;
const NEIGHBOR = 12;
const BAND_HZ: readonly [number, number] = [300, 5000];
/** 이 프레임 수 이상 같은 칸(±1)에 머물면 지속 음조. */
const PERSIST = 6;

/** 인터리브 → 모노 평균. */
export function monoOf(data: Float32Array, channels: number): Float32Array {
  if (channels === 1) return data;
  const n = Math.floor(data.length / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data[i * channels + c] as number;
    out[i] = s / channels;
  }
  return out;
}

/** 제자리 radix-2 FFT(re, im 길이 = 2의 거듭제곱). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

/** 프레임별 파워 스펙트럼(dB, 0..FFT_SIZE/2) — Hann 창. */
export function spectrogramDb(mono: Float32Array): Float32Array[] {
  const win = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  const frames: Float32Array[] = [];
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  for (let s = 0; s + FFT_SIZE <= mono.length; s += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[s + i] as number) * (win[i] as number);
      im[i] = 0;
    }
    fft(re, im);
    const db = new Float32Array(FFT_SIZE / 2);
    for (let k = 0; k < FFT_SIZE / 2; k++)
      db[k] = 10 * Math.log10((re[k] as number) ** 2 + (im[k] as number) ** 2 + 1e-12);
    frames.push(db);
  }
  return frames;
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1] as number;
}

/** 프레임별 봉우리 칸 목록. */
function peaksOf(db: Float32Array, rate: number): number[] {
  const k0 = Math.ceil((BAND_HZ[0] * FFT_SIZE) / rate);
  const k1 = Math.floor((BAND_HZ[1] * FFT_SIZE) / rate);
  const out: number[] = [];
  for (let k = k0; k <= k1; k++) {
    const v = db[k] as number;
    if (v < (db[k - 1] as number) || v < (db[k + 1] as number)) continue;
    const around: number[] = [];
    for (let j = k - NEIGHBOR; j <= k + NEIGHBOR; j++) if (j !== k) around.push(db[j] as number);
    if (v > median(around) + PEAK_DB) out.push(k);
  }
  return out;
}

/**
 * 프레임별 지속 음조 비율(0..1): 지속 봉우리(PERSIST 프레임 이상 ±1칸 연속) 에너지 ÷ 대역 에너지.
 * 반환 길이 = 프레임 수(spectrogramDb와 같다).
 */
export function tonalTrack(frames: readonly Float32Array[], rate: number): Float32Array {
  const peaks = frames.map((f) => peaksOf(f, rate));
  const run = new Map<number, number>();
  const out = new Float32Array(frames.length);
  const k0 = Math.ceil((BAND_HZ[0] * FFT_SIZE) / rate);
  const k1 = Math.floor((BAND_HZ[1] * FFT_SIZE) / rate);
  for (let t = 0; t < frames.length; t++) {
    const next = new Map<number, number>();
    for (const k of peaks[t] as number[]) {
      const prev = Math.max(run.get(k - 1) ?? 0, run.get(k) ?? 0, run.get(k + 1) ?? 0);
      next.set(k, prev + 1);
    }
    const db = frames[t] as Float32Array;
    let band = 0;
    for (let k = k0; k <= k1; k++) band += 10 ** ((db[k] as number) / 10);
    let tonal = 0;
    for (const [k, n] of next) if (n >= PERSIST) tonal += 10 ** ((db[k] as number) / 10);
    out[t] = band > 0 ? Math.min(1, tonal / band) : 0;
    run.clear();
    for (const [k, n] of next) run.set(k, n);
  }
  return out;
}

/** RMS 포락선(창 win 표본, 보폭 hop). */
export function rmsEnvelope(mono: Float32Array, win: number, hop: number): Float32Array {
  const n = Math.max(0, Math.floor((mono.length - win) / hop) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < win; j++) s += (mono[i * hop + j] as number) ** 2;
    out[i] = Math.sqrt(s / win);
  }
  return out;
}

/**
 * 발소리 온셋(표본 위치): 5 ms RMS가 이전 50 ms 최솟값의 4배 + 절대 문턱(최대의 8 %)을 넘는 첫 지점, 최소 간격 gapS.
 */
export function onsetsOf(mono: Float32Array, rate: number, gapS = 0.25): number[] {
  const hop = Math.round(rate * 0.005);
  const env = rmsEnvelope(mono, hop, hop);
  let max = 0;
  for (const v of env) max = Math.max(max, v);
  const abs = max * 0.08;
  const look = 10;
  const out: number[] = [];
  let last = -Infinity;
  for (let i = look; i < env.length; i++) {
    let floor = Infinity;
    for (let j = i - look; j < i; j++) floor = Math.min(floor, env[j] as number);
    const v = env[i] as number;
    if (v > abs && v > floor * 4 && (i - last) * 0.005 >= gapS) {
      out.push(i * hop);
      last = i;
    }
  }
  return out;
}
