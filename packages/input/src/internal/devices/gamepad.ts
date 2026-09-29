// 게임패드 디바이스(Gamepad API — 이벤트 없이 프레임마다 폴링): 첫 연결 패드(표준 매핑 우선) → RawInput.pad.
// 스틱 = 원형 데드존 0.15 뒤 0…1로 다시 늘림, 버튼 = 값(트리거 아날로그), 새 눌림(> 0.5) = hit. see docs/09-traversal.md §4
import type { RawInput } from '../raw-input.ts';

export const STICK_DEADZONE = 0.15;
/** 버튼이 "눌림"으로 보이는 값(트리거 포함). */
export const PAD_PRESS = 0.5;
/** 표준 매핑 스틱 축 쌍(L: 0·1, R: 2·3). */
const STICKS = [
  [0, 1],
  [2, 3],
] as const;

export interface PadLike {
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly value: number; readonly pressed: boolean }[];
}

/** 원형 데드존: 크기 < dz → 0, 그 위는 (m − dz)/(1 − dz)로 늘림(방향 유지). */
export function deadzone(x: number, y: number, dz = STICK_DEADZONE): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * s, y * s];
}

/** 패드 상태를 raw.pad에 반영(없으면 모두 0 — 연결 해제 시 눌린 채 남지 않게). */
export function readPad(raw: RawInput, pad: PadLike | undefined): void {
  const p = raw.pad;
  p.connected = pad !== undefined;
  const prev = p.buttons.slice();
  p.axes.fill(0);
  p.buttons.fill(0);
  if (!pad) return;
  for (const [ix, iy] of STICKS) {
    const [x, y] = deadzone(pad.axes[ix] ?? 0, pad.axes[iy] ?? 0);
    p.axes[ix] = x;
    p.axes[iy] = y;
  }
  const n = Math.min(pad.buttons.length, p.buttons.length);
  for (let i = 0; i < n; i++) {
    const b = pad.buttons[i];
    const v = b ? (b.value > 0 ? b.value : b.pressed ? 1 : 0) : 0;
    p.buttons[i] = v;
    if (v > PAD_PRESS && (prev[i] ?? 0) <= PAD_PRESS) p.hit.add(i);
  }
}

export interface GamepadDevice {
  poll(raw: RawInput): void;
}

export function attachGamepad(win: Window): GamepadDevice {
  const nav = win.navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
  return {
    poll(raw) {
      let pads: (Gamepad | null)[] = [];
      try {
        // 권한 정책(gamepad)으로 막힌 문서에서는 예외 → 패드 없음.
        pads = nav.getGamepads?.() ?? [];
      } catch {
        pads = [];
      }
      const live = pads.filter((g): g is Gamepad => g?.connected === true);
      readPad(raw, live.find((g) => g.mapping === 'standard') ?? live[0]);
    },
  };
}
