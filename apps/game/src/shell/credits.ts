// 크레딧 모델(M10-T06, ADR-0096): 게임 빌드가 내보낸 /credits.json(sources.lock 모든 원천 + ATTRIBUTION)·/oss-licenses.json(런타임 의존 라이선스)을 처음 열 때 받는다.
// 받지 못하면(오래된 배포 등) content/ATTRIBUTION.json(동적 import)으로 대신.
import type { CreditEntry, CreditsModel, LocalName, OssEntry } from '@sanpo/ui';

interface AttributionEntry {
  id: string;
  kind: string;
  title: string;
  url?: string | null;
  license: string;
  attribution?: Partial<LocalName> | null;
}

const local = (a: Partial<LocalName> | null | undefined): LocalName | null =>
  a?.ja || a?.en ? { ja: a.ja ?? a.en ?? '', en: a.en ?? a.ja ?? '', ko: a.ko ?? a.en ?? a.ja ?? '' } : null;

export function creditsOf(
  entries: readonly AttributionEntry[],
  buildId: string | null,
  oss: OssEntry[] = [],
): CreditsModel {
  const data: CreditEntry[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    license: e.license,
    url: e.url ?? null,
    attribution: local(e.attribution),
  }));
  return { buildId, data, oss };
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return (await r.json()) as T;
}

export async function loadCredits(buildId: string | null): Promise<CreditsModel> {
  try {
    const [c, o] = await Promise.all([
      getJson<{ data: AttributionEntry[] }>('/credits.json'),
      getJson<{ packages: OssEntry[] }>('/oss-licenses.json'),
    ]);
    return creditsOf(c.data, buildId, o.packages);
  } catch {
    const m = (await import('../../../../content/ATTRIBUTION.json')) as unknown as {
      default: { entries: AttributionEntry[] };
    };
    return creditsOf(m.default.entries, buildId);
  }
}
