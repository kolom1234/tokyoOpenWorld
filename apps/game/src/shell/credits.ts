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

/** ODbL 4.6 파생 DB(M11-T05 — 빌드 global/odbl/, 파이프라인 map 단계)를 크레딧 맨 앞에 링크. 픽스처(world-mini)는 없음. */
export function odblEntry(worldBase: string | null): AttributionEntry | null {
  if (!worldBase || worldBase.includes('/fixtures/')) return null;
  return {
    id: 'osm-derived-db',
    kind: 'data',
    title: 'OpenStreetMap derived database (ODbL 1.0) — osm-derived.geojsonseq.gz · map.pmtiles',
    url: `${worldBase}/global/odbl/README.txt`,
    license: 'ODbL-1.0',
    attribution: {
      ja: 'OSM から作った派生データベース（ODbL 1.0）をここで公開しています',
      en: 'The OpenStreetMap-derived database used by this world is offered here under ODbL 1.0',
      ko: '이 월드에 쓴 OpenStreetMap 파생 데이터베이스를 ODbL 1.0으로 여기에 공개합니다',
    },
  };
}

/** 라이선스 전문 링크(M11-T05): 런타임 OSS LICENSE 원문(빌드 생성)·제3자 고지(Rocketbox MIT·Noto OFL). */
const NOTICE_ENTRIES: AttributionEntry[] = [
  {
    id: 'oss-license-texts',
    kind: 'notice',
    title: 'Open-source license texts',
    url: '/oss-licenses.txt',
    license: '—',
  },
  {
    id: 'third-party-notices',
    kind: 'notice',
    title: 'Third-party notices',
    url: '/third-party-notices.txt',
    license: '—',
  },
];

export async function loadCredits(buildId: string | null, worldBase: string | null = null): Promise<CreditsModel> {
  const odbl = odblEntry(worldBase);
  const withOdbl = (es: AttributionEntry[]) => [...(odbl ? [odbl] : []), ...es, ...NOTICE_ENTRIES];
  try {
    const [c, o] = await Promise.all([
      getJson<{ data: AttributionEntry[] }>('/credits.json'),
      getJson<{ packages: OssEntry[] }>('/oss-licenses.json'),
    ]);
    return creditsOf(withOdbl(c.data), buildId, o.packages);
  } catch {
    const m = (await import('../../../../content/ATTRIBUTION.json')) as unknown as {
      default: { entries: AttributionEntry[] };
    };
    return creditsOf(withOdbl(m.default.entries), buildId);
  }
}
