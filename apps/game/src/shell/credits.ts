// 크레딧 모델(M10-T01 최소): content/ATTRIBUTION.json(동적 import — 첫 로드 밖). M10-T06에서 빌드 credits.json·OSS 목록 자동 생성으로 바뀐다.
import type { CreditEntry, CreditsModel, LocalName } from '@sanpo/ui';

interface AttributionEntry {
  id: string;
  kind: string;
  title: string;
  url?: string;
  license: string;
  attribution?: Partial<LocalName>;
}

export function creditsOf(entries: readonly AttributionEntry[], buildId: string | null): CreditsModel {
  const data: CreditEntry[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    license: e.license,
    url: e.url ?? null,
    attribution:
      e.attribution?.ja || e.attribution?.en
        ? {
            ja: e.attribution.ja ?? e.attribution.en ?? '',
            en: e.attribution.en ?? e.attribution.ja ?? '',
            ko: e.attribution.ko ?? e.attribution.en ?? e.attribution.ja ?? '',
          }
        : null,
  }));
  return { buildId, data, oss: [] };
}

export async function loadCredits(buildId: string | null): Promise<CreditsModel> {
  const m = (await import('../../../../content/ATTRIBUTION.json')) as unknown as {
    default: { entries: AttributionEntry[] };
  };
  return creditsOf(m.default.entries, buildId);
}
