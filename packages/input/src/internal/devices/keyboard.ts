// 키보드 디바이스: window keydown/keyup → RawInput. 텍스트 입력 포커스 중·창 포커스 상실 시 게임 입력 차단. see docs/modules/input.md
import { keyDown, keyUp, type RawInput, releaseAll } from '../raw-input.ts';

/** 게임이 기본 동작을 막는 키(페이지 스크롤·포커스 이동 방지). */
const PREVENT_DEFAULT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** 텍스트 입력 중이면 게임 액션 비활성(모듈 카드 불변식). */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (t === null || typeof (t as Partial<HTMLElement>).tagName !== 'string') return false;
  const el = t as HTMLElement;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** 리스너를 붙이고 해제 함수를 돌려준다. */
export function attachKeyboard(win: Window, raw: RawInput): () => void {
  const onDown = (e: KeyboardEvent): void => {
    if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    keyDown(raw, e.code, e.repeat);
  };
  const onUp = (e: KeyboardEvent): void => keyUp(raw, e.code);
  const onBlur = (): void => releaseAll(raw);
  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', onBlur);
  return () => {
    win.removeEventListener('keydown', onDown);
    win.removeEventListener('keyup', onUp);
    win.removeEventListener('blur', onBlur);
  };
}
