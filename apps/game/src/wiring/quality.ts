// 품질 티어 배선(M03-T08): 저장된 티어(localStorage)로 시작 → 없으면 첫 표시 뒤 스트리밍이 조용해지면 render.detectQuality()(detect-gpu + 60프레임).
// `quality/changed`(자동 강등·설정 UI)마다 저장. `?quality=`·골든뷰는 고정(감지·저장 안 함). see docs/modules/game.md, docs/07-rendering.md §9
import type { EventBus, Logger, QualityTier } from '@sanpo/core';
import type { RenderService } from '@sanpo/render';

export const QUALITY_STORAGE_KEY = 'sanpo.quality.v1';
const TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

/** 저장소 접근 실패(사생활 모드 등)는 없는 것으로. */
export function loadTier(storage: Pick<Storage, 'getItem'> | undefined): QualityTier | undefined {
  try {
    const v = storage?.getItem(QUALITY_STORAGE_KEY);
    return (TIERS as readonly (string | null | undefined)[]).includes(v) ? (v as QualityTier) : undefined;
  } catch {
    return undefined;
  }
}

function saveTier(storage: Pick<Storage, 'setItem'> | undefined, tier: QualityTier): void {
  try {
    storage?.setItem(QUALITY_STORAGE_KEY, tier);
  } catch {
    // 저장 못 해도 이번 세션은 동작한다.
  }
}

export interface QualityWiringDeps {
  render: Pick<RenderService, 'detectQuality'>;
  bus: EventBus;
  log: Logger;
  storage: Storage | undefined;
  /** `?quality=` 또는 골든뷰 = 고정 티어. */
  fixed: boolean;
  /** 스트리밍이 조용한가(대기·받기·디코드·적용 대기 0). 감지·60프레임 측정은 적재 끊김이 끝난 뒤에(아니면 부풀린 프레임으로 강등된다). */
  streamingIdle?: () => boolean;
  /** 테스트용 타이머 주입. */
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/** 조용해진 뒤 감지까지 기다리는 최대 시간(ms). 넘으면 그냥 감지. */
const IDLE_WAIT_MAX_MS = 60_000;
const IDLE_POLL_MS = 1000;
/** 연속 조용해야 하는 폴링 수. */
const IDLE_POLLS = 2;

function whenIdle(d: QualityWiringDeps, run: () => void): void {
  const timer = d.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  let waited = 0;
  let calm = 0;
  const poll = (): void => {
    calm = (d.streamingIdle?.() ?? true) ? calm + 1 : 0;
    waited += IDLE_POLL_MS;
    if (calm >= IDLE_POLLS || waited >= IDLE_WAIT_MAX_MS) run();
    else timer(poll, IDLE_POLL_MS);
  };
  timer(poll, IDLE_POLL_MS);
}

/** 첫 표시 뒤 호출. 반환 = 구독 해제. */
export function startQualityWiring(d: QualityWiringDeps): () => void {
  if (d.fixed) return () => undefined;
  const off = d.bus.on('quality/changed', ({ tier }) => saveTier(d.storage, tier));
  if (loadTier(d.storage) === undefined) {
    whenIdle(d, () => {
      void d.render
        .detectQuality()
        .then((tier) => saveTier(d.storage, tier))
        .catch((e: unknown) => d.log.warn('detectQuality', e));
    });
  }
  return off;
}
