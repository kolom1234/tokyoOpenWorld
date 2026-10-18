// 메뉴용 게임패드 읽기(표준 매핑): D-pad·L스틱 → 방향(처음 0.35 s 뒤 0.12 s마다 반복), A 선택, B 뒤로, Start, LB·RB 탭. 순수 상태 갱신(테스트) + 폴링은 nav.ts.
import type { NavDir } from './focus.ts';

export type PadEvent = { kind: 'dir'; dir: NavDir } | { kind: 'button'; button: 'a' | 'b' | 'start' | 'lb' | 'rb' };

export interface PadSnapshot {
  buttons: readonly boolean[];
  axes: readonly number[];
}

export interface PadState {
  held: boolean[];
  dir: NavDir | null;
  nextRepeatS: number;
}

const FIRST_REPEAT_S = 0.35;
const REPEAT_S = 0.12;
const STICK = 0.55;
const BUTTONS: readonly [number, 'a' | 'b' | 'start' | 'lb' | 'rb'][] = [
  [0, 'a'],
  [1, 'b'],
  [9, 'start'],
  [4, 'lb'],
  [5, 'rb'],
];

/** 처음 상태: 지금 눌린 버튼은 "이미 누름"으로(메뉴를 연 Start가 곧바로 닫지 않게). */
export function initPadState(p: PadSnapshot | null): PadState {
  return { held: [...(p?.buttons ?? [])], dir: p ? dirOf(p) : null, nextRepeatS: FIRST_REPEAT_S };
}

export function dirOf(p: PadSnapshot): NavDir | null {
  const b = p.buttons;
  if (b[12]) return 'up';
  if (b[13]) return 'down';
  if (b[14]) return 'left';
  if (b[15]) return 'right';
  const x = p.axes[0] ?? 0;
  const y = p.axes[1] ?? 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

/** dt 뒤 새 스냅샷 → 이벤트. 패드가 없으면 상태 초기화. */
export function stepPad(st: PadState, p: PadSnapshot | null, dtS: number): PadEvent[] {
  const out: PadEvent[] = [];
  if (!p) {
    st.held = [];
    st.dir = null;
    return out;
  }
  for (const [i, name] of BUTTONS) {
    const down = p.buttons[i] === true;
    if (down && !st.held[i]) out.push({ kind: 'button', button: name });
    st.held[i] = down;
  }
  const d = dirOf(p);
  if (d !== st.dir) {
    st.dir = d;
    st.nextRepeatS = FIRST_REPEAT_S;
    if (d) out.push({ kind: 'dir', dir: d });
  } else if (d) {
    st.nextRepeatS -= dtS;
    if (st.nextRepeatS <= 0) {
      st.nextRepeatS = REPEAT_S;
      out.push({ kind: 'dir', dir: d });
    }
  }
  return out;
}
