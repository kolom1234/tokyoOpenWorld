// 품질 티어 배선(M03-T08): 저장된 티어(localStorage)로 시작 → 없으면 첫 표시 뒤 render.detectQuality()(detect-gpu + 60프레임).
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
}

/** 첫 표시 뒤 호출. 반환 = 구독 해제. */
export function startQualityWiring(d: QualityWiringDeps): () => void {
  if (d.fixed) return () => undefined;
  const off = d.bus.on('quality/changed', ({ tier }) => saveTier(d.storage, tier));
  if (loadTier(d.storage) === undefined) {
    void d.render
      .detectQuality()
      .then((tier) => saveTier(d.storage, tier))
      .catch((e: unknown) => d.log.warn('detectQuality', e));
  }
  return off;
}
