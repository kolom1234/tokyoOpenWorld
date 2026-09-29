// 품질 티어·동적 해상도(07 §9, M03-T08): 초기 티어 = detect-gpu(벤치마크 JSON 자체 호스팅 — 외부 CDN·CSP 없이) → 적용 후 60프레임 측정해
// 동적 해상도가 바닥(0.5)인데도 넘치면 한 단계 내림. 티어 변경 = 후처리 재구성 + `quality/changed`(streaming L0 반경 배율 등).
// 버스로 들어온 `quality/changed`(게임 설정 UI 등)도 적용한다(같은 티어면 무시 — 되먹임 없음).
import { getGPUTier } from '@pmndrs/detect-gpu';
import type { EventBus, Logger, QualityTier } from '@sanpo/core';
import type { RenderBackend } from '../api.ts';
import { resolvePost } from './post/config.ts';
import { createDynamicResolution, DYNRES_DEFAULTS, type DynamicResolution } from './renderer/dynamic-resolution.ts';

const ORDER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];
/** 적용 후 측정 프레임(07 §9 "60프레임 측정"). */
const MEASURE_FRAMES = 60;
/**
 * 측정 전 대기(프레임 ≈ 5 s): 첫 표시 직후엔 스트리밍 적용·셰이더 컴파일 끊김으로 프레임이 부풀어, staging에서 8 s 안에 high → low까지 내려갔다.
 * 티어를 바꾼 직후(후처리 재컴파일)도 같다.
 */
const WARMUP_FRAMES = 300;
/** 측정 판정: 동적 해상도가 바닥인데 EMA가 이만큼 넘치면 한 단계 내림. */
const DOWNGRADE_S = DYNRES_DEFAULTS.overS * 1.15;

export interface QualityDeps {
  bus: EventBus;
  log: Logger;
  backend: RenderBackend;
  initial: QualityTier;
  dynamic: boolean;
  benchmarksPath: string;
  /** 티어 → 후처리 재구성(렌더 스케일 기본값 반환). */
  applyTier(tier: QualityTier): number;
  /** 동적 해상도 결과 적용. */
  applyScale(scale: number): void;
}

export interface QualityStats {
  tier: QualityTier;
  renderScale: number;
  dynamic: boolean;
  /** 프레임 시간 EMA(ms). */
  frameMs: number;
}

export interface QualityManager {
  readonly tier: QualityTier;
  onFrame(dtS: number): void;
  setTier(tier: QualityTier): void;
  detect(): Promise<QualityTier>;
  stats(): QualityStats;
  dispose(): void;
}

/** detect-gpu 티어(0–3) → 07 §9 티어. Ultra는 사용자가 고른다. WebGL2는 최대 Medium(07 §9 폴백). */
export function tierFromDetect(detected: number, backend: RenderBackend): QualityTier {
  const t: QualityTier = detected >= 3 ? 'high' : detected === 2 ? 'medium' : 'low';
  return backend === 'webgl2' && t === 'high' ? 'medium' : t;
}

export function createQualityManager(d: QualityDeps): QualityManager {
  const cap = (t: QualityTier): QualityTier => (d.backend === 'webgl2' && ORDER.indexOf(t) > 1 ? 'medium' : t);
  let tier = cap(d.initial);
  const dyn: DynamicResolution = createDynamicResolution(resolvePost(tier, {}).renderScale);
  /** null = 측정 안 함, 음수 = 대기 중, 0.. = 측정 프레임 수. */
  let measuring: number | null = null;
  /** 통계용 프레임 시간 EMA(동적 해상도가 꺼져 있어도). */
  let emaS = 1 / 60;
  const apply = (t: QualityTier, emit: boolean): void => {
    tier = cap(t);
    dyn.reset(d.applyTier(tier));
    measuring = -WARMUP_FRAMES;
    if (emit) d.bus.emit('quality/changed', { tier });
    d.log.info(`quality ${tier} (render scale ${dyn.scale})`);
  };
  const off = d.bus.on('quality/changed', ({ tier: t }) => {
    if (cap(t) !== tier) apply(t, false);
  });
  return {
    get tier() {
      return tier;
    },
    onFrame(dtS) {
      if (dtS > 0 && dtS < 0.1) emaS += (dtS - emaS) * 0.1;
      if (d.dynamic) {
        const s = dyn.update(dtS);
        if (s !== undefined) d.applyScale(s);
      }
      if (measuring === null || ++measuring < MEASURE_FRAMES) return;
      // 동적 해상도가 아직 내려가는 중이면 더 지켜본다(바닥에 닿은 뒤에 판정).
      if (d.dynamic && emaS > DYNRES_DEFAULTS.overS && dyn.scale > DYNRES_DEFAULTS.min) {
        measuring = 0;
        return;
      }
      measuring = null;
      const idx = ORDER.indexOf(tier);
      if (d.dynamic && dyn.scale <= DYNRES_DEFAULTS.min && emaS > DOWNGRADE_S && idx > 0) {
        d.log.info(`quality: ${(emaS * 1000).toFixed(1)} ms at render scale ${dyn.scale} → step down`);
        apply(ORDER[idx - 1] as QualityTier, true);
      }
    },
    setTier(t) {
      if (cap(t) !== tier) apply(t, true);
    },
    async detect() {
      const r = await getGPUTier({ benchmarksURL: d.benchmarksPath.replace(/\/$/, '') });
      const t = tierFromDetect(r.tier, d.backend);
      d.log.info(`detect-gpu: tier ${r.tier} (${r.type}${r.gpu ? `, ${r.gpu}` : ''}) → ${t}`);
      if (t !== tier) apply(t, true);
      else measuring = -WARMUP_FRAMES;
      return tier;
    },
    stats: () => ({ tier, renderScale: dyn.scale, dynamic: d.dynamic, frameMs: emaS * 1000 }),
    dispose: () => off(),
  };
}
