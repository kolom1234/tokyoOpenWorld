// 동적 해상도(07 §9, M03-T08): 프레임 시간 EMA로 렌더 스케일 ±0.05(0.5–1.0) — 목표 16.6 ms.
// 수직 동기(60 Hz)에서는 여유가 있어도 dt ≈ 16.7 ms라 "여유"를 직접 알 수 없다 → 느리면 바로 내리고, 목표 안에서 2 s 머물면 한 단계 올려 보고,
// 올린 직후 넘치면 되돌리며 다음 시도까지 대기 시간을 두 배로(최대 30 s). 순수 로직(시간은 dt 누적) — 테스트 가능.

export interface DynResConfig {
  min: number;
  max: number;
  step: number;
  /** 이 프레임 시간(s) EMA를 넘으면 내린다. */
  overS: number;
  /** 이 아래로 머물면 올려 본다. */
  underS: number;
}

export const DYNRES_DEFAULTS: DynResConfig = { min: 0.5, max: 1, step: 0.05, overS: 0.0175, underS: 0.0171 };

/** 평가 간격(프레임), EMA 계수, 올려 보기 대기(s). */
const EVAL_FRAMES = 20;
const EMA_K = 0.1;
const PROBE_WAIT_S = 2;
const BACKOFF_MAX_S = 30;
/** 이보다 긴 dt(로딩 끊김·탭 전환)는 EMA에서 뺀다. */
const HITCH_S = 0.1;

export interface DynamicResolution {
  readonly scale: number;
  readonly emaS: number;
  /** 프레임마다. 스케일이 바뀌면 새 값, 아니면 undefined. */
  update(dtS: number): number | undefined;
  reset(scale: number): void;
}

export function createDynamicResolution(initial: number, cfg: DynResConfig = DYNRES_DEFAULTS): DynamicResolution {
  const clamp = (s: number): number => Math.round(Math.min(Math.max(s, cfg.min), cfg.max) * 100) / 100;
  let scale = clamp(initial);
  let ema = 1 / 60;
  let frames = 0;
  let calm = 0;
  let wait = PROBE_WAIT_S;
  let probing = false;
  const set = (s: number): number | undefined => {
    const next = clamp(s);
    if (next === scale) return undefined;
    scale = next;
    return scale;
  };
  return {
    get scale() {
      return scale;
    },
    get emaS() {
      return ema;
    },
    update(dtS) {
      if (dtS <= 0 || dtS > HITCH_S) return undefined;
      ema += (dtS - ema) * EMA_K;
      calm = ema < cfg.underS ? calm + dtS : 0;
      if (++frames < EVAL_FRAMES) return undefined;
      frames = 0;
      if (ema > cfg.overS) {
        // 올려 본 직후 넘쳤다면 다음 시도까지 더 오래 기다린다.
        wait = probing ? Math.min(wait * 2, BACKOFF_MAX_S) : wait;
        probing = false;
        calm = 0;
        return set(scale - cfg.step);
      }
      if (calm >= wait && scale < cfg.max) {
        probing = true;
        calm = 0;
        return set(scale + cfg.step);
      }
      if (calm >= wait) probing = false;
      return undefined;
    },
    reset(s) {
      scale = clamp(s);
      ema = 1 / 60;
      frames = 0;
      calm = 0;
      wait = PROBE_WAIT_S;
      probing = false;
    },
  };
}
