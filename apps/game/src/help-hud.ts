// 조작 도움말 + 카메라 아래 내리기 알림(임시 DOM HUD — M08 @sanpo/ui가 대체, ADR-0083). 왼쪽 아래 모드별 키 목록(H로 접기·펴기, 접으면 "H 도움말"),
// freecam G 진행·실패 이유(traversal hud.landing — seq가 바뀔 때만). 게임 로직 없음.
import type { GameSystem } from '@sanpo/core';
import type { LandingFailReason, TraversalService } from '@sanpo/traversal';
import { notice, prompt } from './station/hud.ts';

/** 모드별 조작(09 §4 — 키보드). */
export const HELP_LINES: Record<string, readonly string[]> = {
  walk: [
    'WASD 이동 · Shift 달리기 · X 걸음 빠르기 · 마우스 시선(클릭 = 잠금)',
    'V 1인칭/3인칭 · F 상호작용(개찰구 안 계단 → 승강장 · 열린 열차 문 앞 → 탑승)',
    'C 자유 비행(freecam) · R 카셰어 차 부르기(가까운 차도 연석) · 운전석(오른쪽) 문 앞 F = 운전',
  ],
  freecam: [
    'WASD 이동 · E/Q 오르기/내리기 · 휠 속도 · Shift ×4',
    'C 몸으로 복귀(원래 걷던 자리) · G 카메라 아래에 내리기(그 자리에서 걷기)',
  ],
  drive: [
    'W 가속 · S 제동(멈추면 후진) · A/D 조향 · Space 핸드브레이크 · 마우스 둘러보기',
    'L 전조등 · Q/E 방향지시등 · V 시점(추적·운전석) · F 내리기(멈춘 뒤) · C 자유 비행',
    '패드: RT 가속 · LT 제동/후진 · L스틱 조향 · A 핸드브레이크 · D-pad ↑ 전조등 · ←/→ 깜빡이 · X 내리기',
  ],
  train: ['V 시점(서기·좌석·전면 전망) · T 다음 역까지 빨리감기 · F 내리기(정차 중) · C 자유 비행'],
};
const COMMON = '[ ] 볼륨 · 백슬래시(\\) 소리 끔/켬 · H 도움말 접기';

export const LANDING_TEXT: Record<LandingFailReason, string> = {
  'not-ready': '아직 준비 중이에요 — 잠시 뒤 다시 G',
  'no-ground': '아래에서 땅을 찾지 못했어요(너무 높거나 지면을 불러오는 중) — 조금 내려가서 G',
  building: '건물 안·지붕·구조물 위에는 내릴 수 없어요 — 길·광장 위에서 G',
  track: '선로 위·승강장 가장자리에는 내릴 수 없어요 — 승강장 가운데나 보도 위에서 G',
  road: '차도 한가운데에는 내릴 수 없어요 — 보도 위에서 G',
  blocked: '물체와 겹치거나 머리 위가 막혀 내릴 수 없어요 — 옆으로 옮겨 G',
  steep: '경사가 너무 가팔라요 — 평평한 곳에서 G',
};

function panel(doc: Document): HTMLElement {
  let el = doc.getElementById('sanpo-help');
  if (el) return el;
  el = doc.createElement('div');
  el.id = 'sanpo-help';
  el.style.cssText =
    'position:fixed;left:12px;bottom:12px;max-width:min(560px,70vw);padding:6px 10px;border-radius:6px;' +
    'background:rgba(0,0,0,.45);color:#eee;font:12px/1.5 system-ui,sans-serif;pointer-events:none;z-index:30;white-space:pre-line';
  doc.body.append(el);
  return el;
}

/** phase 67(HUD): 모드가 바뀌면 도움말 글, hud.landing seq가 바뀌면 알림. H(편집 칸 밖) = 접기·펴기. */
export function helpHudSystem(doc: Document, traversal: TraversalService): GameSystem {
  let open = true;
  let shown = '';
  let seq = -1;
  let state = '';
  let searching = false;
  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.code !== 'KeyH' || e.repeat || t?.isContentEditable || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA')
      return;
    open = !open;
    shown = '';
  };
  doc.defaultView?.addEventListener('keydown', onKey);
  return {
    id: 'wiring.helpHud',
    phase: 67,
    update() {
      const lines = HELP_LINES[traversal.mode] ?? [];
      const text = open ? [...lines, COMMON].join('\n') : 'H 도움말';
      if (text !== shown) {
        panel(doc).textContent = text;
        shown = text;
      }
      const l = traversal.mode === 'freecam' ? traversal.hud.landing : undefined;
      if (searching && l?.state !== 'searching') {
        prompt(doc, null);
        searching = false;
      }
      if (!l || (l.seq === seq && l.state === state)) return;
      seq = l.seq;
      state = l.state;
      if (l.state === 'searching') {
        prompt(doc, '내릴 곳 찾는 중…');
        searching = true;
      } else notice(doc, LANDING_TEXT[l.reason ?? 'not-ready']);
    },
    dispose() {
      doc.defaultView?.removeEventListener('keydown', onKey);
      doc.getElementById('sanpo-help')?.remove();
    },
  };
}
