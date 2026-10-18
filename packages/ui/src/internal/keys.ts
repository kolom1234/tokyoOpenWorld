// 키 이름 표시(KeyboardEvent.code → 짧은 글자)와 재바인딩 가능한 액션의 기본 키(input DEFAULT_BINDINGS 키보드와 같게 — 테스트 대조는 game).
import type { RebindAction, SettingsModel } from '../api.ts';

export const DEFAULT_KEYS: Readonly<Record<RebindAction, string>> = {
  interact: 'KeyF',
  toggleView: 'KeyV',
  freeCam: 'KeyC',
  sprint: 'ShiftLeft',
  pace: 'KeyX',
  summon: 'KeyR',
  summonBike: 'KeyB',
  land: 'KeyG',
  lights: 'KeyL',
  skip: 'KeyT',
  map: 'KeyM',
  photo: 'KeyP',
};

/** 메뉴·도움말이 쓰는 고정 키(재바인딩 대상 아님 — 겹치면 거부). */
export const RESERVED_KEYS: readonly string[] = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyQ',
  'KeyH',
  'Escape',
  'Enter',
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

const NAMED: Readonly<Record<string, string>> = {
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code] as string;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** 설정의 액션 키(덮어쓰기 > 기본). */
export const keyOf = (s: Pick<SettingsModel, 'keys'>, a: RebindAction): string => s.keys[a] ?? DEFAULT_KEYS[a];

/**
 * 액션 a에 code를 넣는다. 다른 액션이 쓰던 키면 그 액션은 a의 옛 키로 맞바꾼다(키가 사라지지 않게).
 * 고정 키는 거부(undefined). 반환 = 새 keys(기본과 같은 항목은 지움).
 */
export function rebindKeys(
  s: Pick<SettingsModel, 'keys'>,
  a: RebindAction,
  code: string,
): { keys: Partial<Record<RebindAction, string>>; swapped: RebindAction | null } | undefined {
  if (RESERVED_KEYS.includes(code)) return undefined;
  const old = keyOf(s, a);
  const current: Record<RebindAction, string> = { ...DEFAULT_KEYS, ...s.keys };
  let swapped: RebindAction | null = null;
  for (const [other, k] of Object.entries(current) as [RebindAction, string][])
    if (other !== a && k === code) {
      current[other] = old;
      swapped = other;
    }
  current[a] = code;
  const keys: Partial<Record<RebindAction, string>> = {};
  for (const [act, k] of Object.entries(current) as [RebindAction, string][])
    if (k !== DEFAULT_KEYS[act]) keys[act] = k;
  return { keys, swapped };
}
