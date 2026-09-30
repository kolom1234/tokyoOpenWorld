// `?quality=low|medium|high|ultra`·`?post=ssr:0,ao:gtao,aoScale:1,scale:0.85,aerial:full,exp:1.25` → render 품질 티어·후처리 효과 덮어쓰기(M03-T07 A/B 측정).
// exp = 고정 노출 배율(자동 노출을 끈 WebGPU와 WebGL2를 같은 노출로 비교, M03 보강 4).
// see docs/modules/game.md, docs/07-rendering.md §7·§9
import type { PostEffects, QualityTier } from '@sanpo/render';

const TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];
const BOOL_KEYS = ['ssr', 'bloom', 'autoExposure', 'taa', 'lut', 'sharpen'] as const;

export function parseQualityFlag(v: string | null): QualityTier | undefined {
  return (TIERS as readonly string[]).includes(v ?? '') ? (v as QualityTier) : undefined;
}

/** 모르는 키·값은 무시. */
export function parsePostFlag(v: string | null): Partial<PostEffects> {
  const out: Partial<PostEffects> = {};
  for (const part of (v ?? '').split(',')) {
    const [k = '', val = ''] = part.split(':');
    if (k === 'ao' && (val === 'none' || val === 'gtao' || val === 'ssgi')) out.ao = val;
    else if (k === 'aerial' && (val === 'full' || val === 'half')) out.aerial = val;
    else if (k === 'exp' && Number(val) > 0 && Number(val) <= 16) out.fixedExposure = Number(val);
    else if (k === 'aoScale' && Number(val) > 0 && Number(val) <= 1) out.aoScale = Number(val);
    else if (k === 'scale' && Number(val) >= 0.5 && Number(val) <= 1) out.renderScale = Number(val);
    else if ((BOOL_KEYS as readonly string[]).includes(k) && (val === '0' || val === '1'))
      out[k as (typeof BOOL_KEYS)[number]] = val === '1';
  }
  return out;
}
