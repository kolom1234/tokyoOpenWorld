// 도감 명소(M10-T04, ADR-0094): content/poi/pois.json(자체 설명·반경·종류) + content/poi/wikidata.json(이름·좌표 CC0) → DiscoveryModel·발견 판정(sim createPoiService, 2 s 체류).
// 발견 = 알림 + 기록(게임 시각·날씨) + 지도 빠른 이동 대상에 추가. 기록은 세이브(T06)가 저장·복원.
import type { GameSystem, Vec3d } from '@sanpo/core';
import { lonLatToWF } from '@sanpo/geo';
import { createPoiService } from '@sanpo/sim';
import type { DiscoveryModel, LocalName, PoiCategory, Signal } from '@sanpo/ui';
import POIS from '../../../../content/poi/pois.json';
import WD from '../../../../content/poi/wikidata.json';
import { pushNotice } from './hud-state.ts';

type Lang = keyof LocalName;
interface PoiJson {
  id: string;
  wikidata: string;
  kind: PoiCategory;
  radiusM: number;
  name: Record<Lang, string>;
  description: LocalName;
}
interface WdJson {
  id: string;
  labels: Partial<Record<Lang, string>>;
  aliases: Partial<Record<Lang, string[]>>;
  lat: number;
  lon: number;
}

/** 이름 규칙: label = Wikidata 라벨, alias:<s> = Wikidata 별칭(괄호 설명 지움), derived:<s> = 우리가 옮겨 적은 이름(ko만). */
export function resolveName(spec: string, lang: Lang, wd: WdJson): string {
  const strip = (s: string) => s.replace(/\s*[（(][^)）]*[)）]\s*$/, '');
  if (spec.startsWith('alias:')) {
    const a = spec.slice(6);
    return wd.aliases[lang]?.includes(a) ? strip(a) : (wd.labels[lang] ?? strip(a));
  }
  if (spec.startsWith('derived:')) return spec.slice(8);
  return wd.labels[lang] ?? wd.labels.en ?? wd.labels.ja ?? '';
}

export interface PoiEntry {
  id: string;
  name: LocalName;
  kind: PoiCategory;
  posWF: Vec3d;
  radiusM: number;
  description: LocalName;
}

export function poiEntries(): PoiEntry[] {
  const wdList = (WD as unknown as { pois: WdJson[] }).pois;
  return (POIS as unknown as { pois: PoiJson[] }).pois.flatMap((p) => {
    const wd = wdList.find((w) => w.id === p.id);
    if (!wd) return [];
    const pos = lonLatToWF({ lon: wd.lon, lat: wd.lat });
    return [
      {
        id: p.id,
        name: {
          ja: resolveName(p.name.ja, 'ja', wd),
          en: resolveName(p.name.en, 'en', wd),
          ko: resolveName(p.name.ko, 'ko', wd),
        },
        kind: p.kind,
        posWF: { x: pos.x, y: 0, z: pos.z },
        radiusM: p.radiusM,
        description: p.description,
      },
    ];
  });
}

export interface DiscoveryRecord {
  id: string;
  atMs: number;
  weather: string;
  photoIds: string[];
  /** 발견한 자리(빠른 이동 목표). */
  posWF?: Vec3d;
}

export interface DiscoveryState {
  readonly entries: readonly PoiEntry[];
  records(): DiscoveryRecord[];
  restore(rs: readonly DiscoveryRecord[]): void;
  attachPhoto(poiId: string, photoId: string): void;
  /** 사진 상한으로 지운 사진을 모든 기록에서 뺀다. */
  detachPhoto(photoId: string): void;
  system(src: { player(): Readonly<Vec3d>; mode(): string; timeMs(): number; weather(): string }): GameSystem;
}

function dropPhoto(recs: Iterable<DiscoveryRecord>, photoId: string): boolean {
  let hit = false;
  for (const r of recs) {
    const i = r.photoIds.indexOf(photoId);
    if (i >= 0) {
      r.photoIds.splice(i, 1);
      hit = true;
    }
  }
  return hit;
}

export function createDiscovery(
  doc: Document,
  out: Signal<readonly DiscoveryModel[]>,
  /** 발견(명소, 발견한 순간 플레이어 위치 — 걸을 수 있는 자리, 빠른 이동 목표). */
  onFound: (e: PoiEntry, at: Vec3d) => void,
): DiscoveryState {
  const entries = poiEntries();
  const svc = createPoiService(entries.map((e) => ({ id: e.id, posWF: e.posWF, radiusM: e.radiusM })));
  const recs = new Map<string, DiscoveryRecord>();
  const publish = () => {
    out.value = entries.map((e) => {
      const r = recs.get(e.id);
      return {
        id: e.id,
        name: e.name,
        category: e.kind,
        posWF: e.posWF,
        description: e.description,
        discoveredAtMs: r?.atMs ?? null,
        weather: r?.weather ?? null,
        photoIds: r?.photoIds ?? [],
      };
    });
  };
  publish();
  return {
    entries,
    records: () => [...recs.values()],
    restore(rs) {
      for (const r of rs) if (entries.some((e) => e.id === r.id)) recs.set(r.id, { ...r, photoIds: [...r.photoIds] });
      svc.restore(rs.map((r) => r.id));
      publish();
    },
    attachPhoto(poiId, photoId) {
      const r = recs.get(poiId);
      if (!r) return;
      r.photoIds.push(photoId);
      publish();
    },
    detachPhoto(photoId) {
      if (dropPhoto(recs.values(), photoId)) publish();
    },
    system(src) {
      return {
        id: 'shell.discovery',
        phase: 96,
        update(f) {
          for (const id of svc.update(src.player(), src.mode(), f.dtReal)) {
            const e = entries.find((x) => x.id === id) as PoiEntry;
            const at = { ...src.player() };
            recs.set(id, { id, atMs: src.timeMs(), weather: src.weather(), photoIds: [], posWF: at });
            pushNotice(doc, { key: 'hud.notice.discovered', params: { name: e.name } });
            onFound(e, at);
            publish();
          }
        },
        dispose() {},
      };
    },
  };
}
