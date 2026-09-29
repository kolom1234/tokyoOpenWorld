// 품질 티어 → 후처리 효과(07 §9 표의 AO/GI/SSR 행 + 07 §7 나머지). 티어 선택·동적 해상도는 M03-T08, 여기는 표와 덮어쓰기만.
import type { PostEffects, QualityTier } from '../../api.ts';

/**
 * 1440p RTX 3050 Laptop 실측(M03-T07, 무제한 프레임 p50 증가분): GTAO(½) +5 ms, SSR(½) +2.7, Bloom +2.7, TRAA +8, 노출·LUT·샤픈 +2,
 * SSGI(r186 — 해상도 배율 없음) ≈ +100 ms 이상 → SSGI는 Ultra만(07 §9 High의 SSGI(½)에서 이탈, ADR-0035). 렌더 스케일은 07 §9 표.
 * High 안 빼기 실측: GTAO 3.5, Bloom 3.0(½ → ¼ 해상도로), Sharpen 2.2, SSR 1.6, 노출 0.6, LUT 0.5 ms → Sharpen은 Ultra만.
 */
export const POST_TIERS: Readonly<Record<QualityTier, PostEffects>> = {
  low: fx('none', false, false, false, 0.6, 'half'),
  medium: fx('gtao', false, true, false, 0.75, 'half'),
  high: fx('gtao', true, true, false, 0.85, 'half'),
  ultra: fx('ssgi', true, true, true, 1, 'full'),
};

function fx(
  ao: PostEffects['ao'],
  ssr: boolean,
  bloom: boolean,
  sharpen: boolean,
  renderScale: number,
  aerial: PostEffects['aerial'],
): PostEffects {
  return { ao, aoScale: 0.5, ssr, bloom, autoExposure: true, taa: true, lut: true, sharpen, renderScale, aerial };
}

/** 티어 기본값 + 덮어쓰기. SSGI 시간 필터는 TAA를 전제 → TAA를 끄면 SSGI는 GTAO, 렌더 스케일은 1. */
export function resolvePost(tier: QualityTier, override: Partial<PostEffects>): PostEffects {
  const p = { ...POST_TIERS[tier], ...override };
  if (p.ao === 'ssgi' && !p.taa) p.ao = 'gtao';
  // TAAU 없이는 저해상도를 복원할 수 없다.
  if (!p.taa) p.renderScale = 1;
  p.renderScale = Math.min(Math.max(p.renderScale, 0.5), 1);
  return p;
}
