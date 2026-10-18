// 역·탐방 HUD 안내(M07-T06 → M10-T01): 상호작용 안내·검은 막·알림·역 근접 안내를 shell/hud-state에 쓴다(그리기는 @sanpo/ui HUD — id는 그대로 #station-prompt 등).
import type { GuideModel, Msg } from '@sanpo/ui';
import { pushNotice, setFade, setGuide, setPrompt } from '../shell/hud-state.ts';

const FADE_S = 0.3;
export const FADE_MS = FADE_S * 1000;

/** 상호작용 안내(null = 숨김) — 역 칸. */
export function prompt(doc: Document, msg: Msg | null): void {
  setPrompt(doc, 'station', msg);
}

/** 검은 막 페이드(UI 전환 0.3 s). */
export function fade(doc: Document, on: boolean): void {
  setFade(doc, on);
}

/** 알림(4 s — UI가 지움). */
export function notice(doc: Document, msg: Msg): void {
  pushNotice(doc, msg);
}

/** 역 근접 안내(화면 위 가운데, null = 숨김 — station/guide.ts). */
export function guide(doc: Document, g: GuideModel | null): void {
  setGuide(doc, g);
}
