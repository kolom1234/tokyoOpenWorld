// 도감 원천(M10-T04, ADR-0094): `poi-wikidata` = Wikidata 라벨·별칭·좌표(P625, CC0) → content/poi/wikidata.json, `poi-review` = 위키백과(ja·en·ko 사이트링크) 본문과 설명 겹침 → content/poi/review.json.
// User-Agent는 저장소 주소만(개인 정보 없음). 네트워크 단계 — CI는 커밋된 결과만 검사한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { overlap, POI_LANGS, type PoiLang, promoHits, sha256 } from './text-check.ts';

const UA = 'tokyo-sanpo-pipeline/0.1 (https://github.com/kolom1234/tokyoOpenWorld)';

export interface PoiContent {
  id: string;
  wikidata: string;
  kind: string;
  radiusM: number;
  name: Record<PoiLang, string>;
  description: Record<PoiLang, string>;
  descriptionSource: string;
}

export interface WikidataPoi {
  id: string;
  wikidata: string;
  labels: Partial<Record<PoiLang, string>>;
  aliases: Partial<Record<PoiLang, string[]>>;
  lat: number;
  lon: number;
  sitelinks: Partial<Record<PoiLang, string>>;
}

export const readPois = (repo: string): { author: string; pois: PoiContent[] } =>
  JSON.parse(readFileSync(join(repo, 'content/poi/pois.json'), 'utf8')) as { author: string; pois: PoiContent[] };

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

interface Entity {
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<string, { mainsnak: { datavalue?: { value: { latitude: number; longitude: number } } } }[]>;
  sitelinks?: Record<string, { title: string }>;
}

function toPoi(id: string, qid: string, e: Entity): WikidataPoi {
  const coord = e.claims?.P625?.[0]?.mainsnak.datavalue?.value;
  if (!coord) throw new Error(`${qid}: P625 좌표 없음`);
  const labels: WikidataPoi['labels'] = {};
  const aliases: WikidataPoi['aliases'] = {};
  const sitelinks: WikidataPoi['sitelinks'] = {};
  for (const l of POI_LANGS) {
    const v = e.labels?.[l]?.value;
    if (v) labels[l] = v;
    const a = e.aliases?.[l]?.map((x) => x.value);
    if (a?.length) aliases[l] = a;
    const s = e.sitelinks?.[`${l}wiki`]?.title;
    if (s) sitelinks[l] = s;
  }
  return { id, wikidata: qid, labels, aliases, lat: coord.latitude, lon: coord.longitude, sitelinks };
}

export async function fetchWikidata(repo: string, log: Logger): Promise<WikidataPoi[]> {
  const { pois } = readPois(repo);
  const ids = pois.map((p) => p.wikidata);
  const url =
    'https://www.wikidata.org/w/api.php?' +
    new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'labels|aliases|claims|sitelinks',
      languages: 'ja|en|ko',
      format: 'json',
    });
  const res = (await getJson(url)) as { entities: Record<string, Entity> };
  const out = pois.map((p) => toPoi(p.id, p.wikidata, res.entities[p.wikidata] ?? {}));
  const file = {
    $comment: 'Wikidata(CC0) 라벨·별칭·좌표·사이트링크 — `pnpm pipeline poi-wikidata`가 생성. 손으로 고치지 않는다.',
    license: 'CC0-1.0',
    retrievedAt: new Date().toISOString().slice(0, 10),
    pois: out,
  };
  writeFileSync(join(repo, 'content/poi/wikidata.json'), `${JSON.stringify(file, null, 2)}\n`);
  log.info(`wikidata: ${out.length} POIs`);
  return out;
}

async function wikipediaText(lang: PoiLang, title: string): Promise<{ text: string; revid: number }> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: 'query',
      prop: 'extracts|revisions',
      explaintext: '1',
      rvprop: 'ids',
      titles: title,
      format: 'json',
      formatversion: '2',
    });
  const r = (await getJson(url)) as { query: { pages: { extract?: string; revisions?: { revid: number }[] }[] } };
  const page = r.query.pages[0];
  return { text: page?.extract ?? '', revid: page?.revisions?.[0]?.revid ?? 0 };
}

export interface ReviewEntry {
  id: string;
  lang: PoiLang;
  sha256: string;
  wikipedia: { title: string; revid: number; chars: number } | null;
  lcs: number;
  lcsText: string;
  ngram: number;
  promo: string[];
  pass: boolean;
}

export async function reviewDescriptions(repo: string, log: Logger): Promise<ReviewEntry[]> {
  const { pois } = readPois(repo);
  const wd = (JSON.parse(readFileSync(join(repo, 'content/poi/wikidata.json'), 'utf8')) as { pois: WikidataPoi[] })
    .pois;
  const out: ReviewEntry[] = [];
  for (const p of pois)
    for (const lang of POI_LANGS) {
      const desc = p.description[lang];
      const title = wd.find((w) => w.id === p.id)?.sitelinks[lang];
      const src = title ? await wikipediaText(lang, title) : null;
      const o = overlap(desc, src?.text ?? '', lang);
      const promo = promoHits(desc, lang);
      out.push({
        id: p.id,
        lang,
        sha256: sha256(desc),
        wikipedia: src && title ? { title, revid: src.revid, chars: src.text.length } : null,
        lcs: o.lcs,
        lcsText: o.lcsText,
        ngram: o.ngram,
        promo,
        pass: o.pass && promo.length === 0,
      });
    }
  const file = {
    $comment:
      '도감 설명 자체 작성 검수 — `pnpm pipeline poi-review`(위키백과 본문과 최장 공통 부분 문자열·8-gram 공유율·홍보 문구). 설명을 고치면 다시 실행.',
    checkedAt: new Date().toISOString().slice(0, 10),
    entries: out,
  };
  writeFileSync(join(repo, 'content/poi/review.json'), `${JSON.stringify(file, null, 2)}\n`);
  const fails = out.filter((e) => !e.pass);
  log.info(
    `review: ${out.length} descriptions, ${fails.length} fail ${JSON.stringify(fails.map((f) => [f.id, f.lang, f.lcs, f.lcsText, f.promo]))}`,
  );
  return out;
}
