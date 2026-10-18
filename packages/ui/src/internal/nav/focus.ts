// 공간 내비게이션(키보드 화살표·게임패드 D-pad): 지금 포커스 사각형에서 방향 쪽 후보 중 가장 가까운 것. 순수 함수(DOM 없음 — 테스트).
export type NavDir = 'up' | 'down' | 'left' | 'right';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 방향 축 거리 + 옆 축 어긋남 × 2(옆으로 많이 벗어난 후보는 뒤로). 방향 반대쪽·겹침은 후보 아님. */
function score(from: Rect, to: Rect, dir: NavDir): number {
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2;
  const tcy = to.y + to.h / 2;
  let main: number;
  let cross: number;
  if (dir === 'down' || dir === 'up') {
    main = dir === 'down' ? to.y - (from.y + from.h) : from.y - (to.y + to.h);
    if ((dir === 'down' ? tcy - fcy : fcy - tcy) <= 1) return Number.POSITIVE_INFINITY;
    const overlap = Math.min(from.x + from.w, to.x + to.w) - Math.max(from.x, to.x);
    cross = overlap > 0 ? 0 : Math.abs(tcx - fcx);
  } else {
    main = dir === 'right' ? to.x - (from.x + from.w) : from.x - (to.x + to.w);
    if ((dir === 'right' ? tcx - fcx : fcx - tcx) <= 1) return Number.POSITIVE_INFINITY;
    const overlap = Math.min(from.y + from.h, to.y + to.h) - Math.max(from.y, to.y);
    cross = overlap > 0 ? 0 : Math.abs(tcy - fcy);
  }
  return Math.max(0, main) + cross * 2;
}

/** 다음 포커스 후보 번호(없으면 −1). from이 없으면 첫 후보. */
export function pickNext(from: Rect | null, rects: readonly Rect[], dir: NavDir): number {
  if (rects.length === 0) return -1;
  if (from === null) return 0;
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  rects.forEach((r, i) => {
    const s = score(from, r, dir);
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/** 키 → 방향(화살표만 — WASD는 게임 키라 메뉴에서 쓰지 않는다). */
export function dirOfKey(code: string): NavDir | null {
  switch (code) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}
