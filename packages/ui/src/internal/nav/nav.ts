// 메뉴 내비게이션 드라이버(DOM): 화살표·게임패드 → 공간 포커스 이동, ←→ = 조절(data-nav-adjust), Esc·B = 뒤로, A = 선택, LB·RB = 탭, Start.
// 활성 화면(scope)이 있을 때만 동작한다(HUD 중에는 게임 입력이 키를 갖는다). 마우스는 기본 동작(클릭) + 올리면 포커스.
import { dirOfKey, type NavDir, pickNext, type Rect } from './focus.ts';
import { initPadState, type PadEvent, type PadSnapshot, type PadState, stepPad } from './pad.ts';

export interface NavHandlers {
  /** 지금 메뉴 화면 루트(없으면 내비게이션 꺼짐). */
  scope(): HTMLElement | null;
  back(): void;
  start(): void;
  tab(delta: -1 | 1): void;
}

export const NAV_SELECTOR = '[data-nav]:not([disabled])';

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(NAV_SELECTOR)].filter(visible);
}

/** 화면이 열릴 때: data-autofocus > 첫 후보. */
export function focusFirst(scope: HTMLElement): void {
  const el = scope.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? focusables(scope)[0];
  el?.focus({ preventScroll: false });
}

function move(scope: HTMLElement, dir: NavDir): void {
  const list = focusables(scope);
  const cur = scope.ownerDocument.activeElement as HTMLElement | null;
  const inScope = cur && scope.contains(cur) && list.includes(cur) ? cur : null;
  if (inScope && (dir === 'left' || dir === 'right') && inScope.hasAttribute('data-nav-adjust')) {
    inScope.dispatchEvent(new CustomEvent('navadjust', { detail: dir === 'right' ? 1 : -1 }));
    return;
  }
  const others = inScope ? list.filter((e) => e !== inScope) : list;
  const i = pickNext(inScope ? rectOf(inScope) : null, others.map(rectOf), dir);
  const next = others[i];
  if (next) {
    next.focus();
    next.scrollIntoView?.({ block: 'nearest' });
    return;
  }
  // 그쪽에 컨트롤이 없으면 긴 목록(data-scroll)을 굴린다(크레딧·도감 — 패드로도 읽게).
  const box = scope.querySelector<HTMLElement>('[data-scroll]');
  if (box && (dir === 'up' || dir === 'down')) box.scrollBy?.({ top: dir === 'down' ? SCROLL_PX : -SCROLL_PX });
}

const SCROLL_PX = 140;

/** code가 빈 합성 키 이벤트(자동화·일부 IME) 대비. */
const KEY_TO_CODE: Readonly<Record<string, string>> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  Escape: 'Escape',
  Backspace: 'Backspace',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
};

function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function readPad(win: Window): PadSnapshot | null {
  const pads = win.navigator.getGamepads?.() ?? [];
  for (const p of pads) if (p?.connected) return { buttons: p.buttons.map((b) => b.pressed), axes: [...p.axes] };
  return null;
}

function onPad(e: PadEvent, scope: HTMLElement, h: NavHandlers): void {
  if (e.kind === 'dir') {
    move(scope, e.dir);
    return;
  }
  if (e.button === 'a') {
    const cur = scope.ownerDocument.activeElement as HTMLElement | null;
    if (cur && scope.contains(cur)) cur.click();
    else focusFirst(scope);
  } else if (e.button === 'b') h.back();
  else if (e.button === 'start') h.start();
  else h.tab(e.button === 'lb' ? -1 : 1);
}

export function createNav(win: Window, h: NavHandlers): { dispose(): void } {
  const onKey = (e: KeyboardEvent): void => {
    const scope = h.scope();
    if (!scope || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (scope.querySelector('[data-capturing]')) return; // 키 재바인딩 대기 중
    const code = e.code || KEY_TO_CODE[e.key] || '';
    const dir = dirOfKey(code);
    if (dir) {
      e.preventDefault();
      move(scope, dir);
    } else if (code === 'Escape' || (code === 'Backspace' && !isTextField(e.target))) {
      e.preventDefault();
      h.back();
    } else if (code === 'BracketLeft' || code === 'BracketRight') h.tab(code === 'BracketLeft' ? -1 : 1);
  };
  const onOver = (e: MouseEvent): void => {
    const scope = h.scope();
    const el = (e.target as Element | null)?.closest?.(NAV_SELECTOR) as HTMLElement | null;
    if (scope && el && scope.contains(el) && scope.ownerDocument.activeElement !== el)
      el.focus({ preventScroll: true });
  };
  let pad: PadState = initPadState(null);
  let last = 0;
  let raf = 0;
  let had = false;
  const tick = (now: number): void => {
    raf = win.requestAnimationFrame(tick);
    const scope = h.scope();
    if (!scope) {
      had = false;
      return;
    }
    const snap = readPad(win);
    if (!had) pad = initPadState(snap);
    had = true;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    for (const ev of stepPad(pad, snap, dt)) onPad(ev, scope, h);
  };
  raf = win.requestAnimationFrame(tick);
  win.addEventListener('keydown', onKey);
  win.document.addEventListener('mouseover', onOver);
  return {
    dispose() {
      win.cancelAnimationFrame(raf);
      win.removeEventListener('keydown', onKey);
      win.document.removeEventListener('mouseover', onOver);
    },
  };
}
