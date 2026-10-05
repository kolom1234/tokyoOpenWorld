// 차내 안내 화면(M07-T05 — 09 §2 train "LCD 풍, 다국어"): 열차 탑승 중 화면 위쪽 LCD 풍 패널(노선색 띠·방향·다음 역/정차 역·도착까지·문 쪽·경계역 안내),
// 일본어 → 영어 → 한국어 4 s마다 순환. 문구는 자체 작성(실제 안내 방송·문구 복제 없음). 빨리감기 페이드 = 화면 전체 검은 막(traversal hud.fade).
// see docs/modules/game.md, docs/09-traversal.md §2
import type { GameSystem } from '@sanpo/core';
import type { RailNetwork, TimetableFile } from '@sanpo/tile-format';
import type { TrainHud, TraversalService } from '@sanpo/traversal';

type Lang = 'ja' | 'en' | 'ko';
type Name = { ja: string; en: string; ko?: string };
const LANGS: readonly Lang[] = ['ja', 'en', 'ko'];
const ROTATE_S = 4;

/** 방향 이름(선로 heading — 자체 문구). */
const HEADING: Readonly<Record<string, Name>> = {
  outer: { ja: '外回り', en: 'Outer loop', ko: '외선 순환' },
  inner: { ja: '内回り', en: 'Inner loop', ko: '내선 순환' },
  north: { ja: '北行', en: 'Northbound', ko: '북행' },
  south: { ja: '南行', en: 'Southbound', ko: '남행' },
  asakusa: { ja: '浅草方面', en: 'for Asakusa', ko: '아사쿠사 방면' },
  shibuya: { ja: '渋谷方面', en: 'for Shibuya', ko: '시부야 방면' },
};

const T = {
  next: { ja: (s: string) => `次は ${s}`, en: (s: string) => `Next: ${s}`, ko: (s: string) => `다음 역 ${s}` },
  at: {
    ja: (s: string) => `${s} に停車中`,
    en: (s: string) => `Now stopped at ${s}`,
    ko: (s: string) => `${s} 정차 중`,
  },
  min: {
    ja: (n: number) => `あと約 ${n} 分`,
    en: (n: number) => `in about ${n} min`,
    ko: (n: number) => `약 ${n}분 뒤`,
  },
  soon: { ja: 'まもなく到着', en: 'Arriving shortly', ko: '곧 도착' },
  left: { ja: '左側のドアが開きます', en: 'Doors open on the left', ko: '왼쪽 문이 열립니다' },
  right: { ja: '右側のドアが開きます', en: 'Doors open on the right', ko: '오른쪽 문이 열립니다' },
  edge: {
    ja: (s: string) => `この先は未開放エリアです。${s}で降ります`,
    en: (s: string) => `The area beyond is not open yet. Alighting at ${s}.`,
    ko: (s: string) => `이 앞은 미개방 구역입니다. ${s}에서 내립니다.`,
  },
  keys: {
    ja: 'V 視点 · T 次の駅まで早送り · F 降車(停車中)',
    en: 'V view · T skip to next stop · F get off (stopped)',
    ko: 'V 시점 · T 다음 역까지 · F 하차(정차 중)',
  },
} as const;

const pick = (n: Name | undefined, lang: Lang, fallback: string): string => (n ? (n[lang] ?? n.en) : fallback);

export interface TrainLcdData {
  network: RailNetwork;
  timetables: readonly TimetableFile[];
}

/** 패널 문구(한 언어). */
export function lcdText(
  h: TrainHud,
  d: TrainLcdData | undefined,
  lang: Lang,
): { line: string; color: string; main: string; sub: string } {
  const station = (id: string | null) => pick(d?.network.stations.find((s) => s.id === id)?.name, lang, id ?? '');
  const route = d?.timetables.flatMap((f) => f.routes).find((r) => r.id === h.routeId);
  const line = d?.network.lines.find((l) => l.id === h.lineId);
  const head = `${pick(route?.name ?? line?.name, lang, h.lineId)} ${pick(HEADING[h.heading], lang, '')}`.trim();
  const color = route?.color ?? line?.color ?? '#888888';
  if (h.notice === 'mvpEdge') return { line: head, color, main: T.edge[lang](station(h.stoppedAtStationId)), sub: '' };
  const main = h.stoppedAtStationId
    ? T.at[lang](station(h.stoppedAtStationId))
    : h.nextStationId
      ? T.next[lang](station(h.nextStationId))
      : '';
  const parts: string[] = [];
  if (!h.stoppedAtStationId && h.arrivalInS !== null)
    parts.push(h.arrivalInS < 30 ? T.soon[lang] : T.min[lang](Math.max(1, Math.round(h.arrivalInS / 60))));
  if (h.doorSide !== 0) parts.push(h.doorSide < 0 ? T.left[lang] : T.right[lang]);
  return { line: head, color, main, sub: parts.join(' · ') };
}

function el(doc: Document, css: string): HTMLDivElement {
  const e = doc.createElement('div');
  e.style.cssText = css;
  return e;
}

/** phase 90(ui): traversal hud.train → 패널, hud.fade → 검은 막. rail = 적재된 철도(없으면 역 id 그대로). */
export function trainLcdSystem(
  doc: Document,
  traversal: TraversalService,
  rail: () => TrainLcdData | undefined,
): GameSystem {
  const fade = el(
    doc,
    'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition:none',
  );
  const panel = el(
    doc,
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);min-width:420px;max-width:80vw;display:none;z-index:41;pointer-events:none;' +
      'background:#0b0f14;border:2px solid #2b3540;border-radius:6px;font:600 15px/1.35 system-ui,sans-serif;color:#f4f1e6;box-shadow:0 2px 12px #0008',
  );
  const band = el(doc, 'padding:4px 12px;font-size:13px;color:#fff');
  const main = el(doc, 'padding:6px 12px 2px;font-size:22px;color:#ffd257');
  const sub = el(doc, 'padding:0 12px 6px;font-size:14px;color:#cfe3ff');
  const keys = el(doc, 'padding:3px 12px 5px;font-size:11px;color:#8a96a3;border-top:1px solid #1d252e');
  panel.append(band, main, sub, keys);
  doc.body.append(fade, panel);
  let t = 0;
  return {
    id: 'ui/train-lcd',
    phase: 90,
    update(f) {
      t += f.dtReal;
      fade.style.opacity = String(traversal.hud.fade ?? 0);
      const h = traversal.mode === 'train' ? traversal.hud.train : undefined;
      panel.style.display = h ? 'block' : 'none';
      if (!h) return;
      const lang = LANGS[Math.floor(t / ROTATE_S) % LANGS.length] ?? 'ja';
      const x = lcdText(h, rail(), lang);
      band.textContent = x.line;
      band.style.background = x.color;
      main.textContent = x.main;
      sub.textContent = x.sub;
      keys.textContent = T.keys[lang];
    },
    dispose() {
      fade.remove();
      panel.remove();
    },
  };
}
