// HUD 안내 상태(문서당 하나): 상호작용 안내(출처별 칸 — 우선순위 순), 알림(seq), 역 근접 안내, 검은 막. 게임 배선이 쓰고 shell/bridge가 10 Hz로 UI(@sanpo/ui HUD)에 넘긴다.
// 옛 임시 DOM(station/hud.ts의 prompt·notice·guide·fade)을 대체한다 — 문자열 대신 번역 키(Msg).
import type { DriveModel, GuideModel, Msg, TrainModel } from '@sanpo/ui';

/** 안내 칸(앞이 우선). */
export const PROMPT_SLOTS = ['landing', 'station', 'vehicle'] as const;
export type PromptSlot = (typeof PROMPT_SLOTS)[number];

export interface HudState {
  prompts: Partial<Record<PromptSlot, Msg>>;
  notice: Msg | null;
  noticeSeq: number;
  guide: GuideModel | null;
  fade: boolean;
  /** 탈것 계기(drive·cycle — vehicles/drive-hud). */
  drive: DriveModel | null;
  /** 열차 다음 역(train — train-lcd). */
  train: TrainModel | null;
  /** 바뀔 때마다 증가(브리지가 바뀐 것만 넘긴다). */
  version: number;
}

const states = new WeakMap<Document, HudState>();

export function hudStateOf(doc: Document): HudState {
  let s = states.get(doc);
  if (!s) {
    s = { prompts: {}, notice: null, noticeSeq: 0, guide: null, fade: false, drive: null, train: null, version: 0 };
    states.set(doc, s);
  }
  return s;
}

const sameMsg = (a: Msg | null | undefined, b: Msg | null | undefined): boolean =>
  a === b || (!!a && !!b && a.key === b.key && JSON.stringify(a.params) === JSON.stringify(b.params));

export function setPrompt(doc: Document, slot: PromptSlot, msg: Msg | null): void {
  const s = hudStateOf(doc);
  if (sameMsg(s.prompts[slot], msg)) return;
  if (msg) s.prompts[slot] = msg;
  else delete s.prompts[slot];
  s.version++;
}

export function topPrompt(s: HudState): Msg | null {
  for (const k of PROMPT_SLOTS) {
    const m = s.prompts[k];
    if (m) return m;
  }
  return null;
}

export function pushNotice(doc: Document, msg: Msg): void {
  const s = hudStateOf(doc);
  s.notice = msg;
  s.noticeSeq++;
  s.version++;
}

export function setGuide(doc: Document, g: GuideModel | null): void {
  const s = hudStateOf(doc);
  if (s.guide === g || (s.guide && g && JSON.stringify(s.guide) === JSON.stringify(g))) return;
  s.guide = g;
  s.version++;
}

export function setFade(doc: Document, on: boolean): void {
  const s = hudStateOf(doc);
  if (s.fade === on) return;
  s.fade = on;
  s.version++;
}

export function setDrive(doc: Document, d: DriveModel | null): void {
  hudStateOf(doc).drive = d;
}

export function setTrain(doc: Document, t: TrainModel | null): void {
  hudStateOf(doc).train = t;
}
