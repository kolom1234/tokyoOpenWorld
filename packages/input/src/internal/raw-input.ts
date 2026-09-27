// 디바이스 원시 상태(프레임 사이 누적): 눌린 키·버튼, 이번 프레임 새 눌림, 마우스·휠 누적. 순수 함수로 갱신. see docs/09-traversal.md §4
import type { MouseAxis } from '../api.ts';

/** `WheelEvent.deltaMode` → 노치 환산(1 노치 ≈ 100 px ≈ 3 줄 — 주요 브라우저 기본 스크롤 양). */
const WHEEL_PX_PER_NOTCH = 100;
const WHEEL_LINES_PER_NOTCH = 3;

export interface RawInput {
  readonly keysDown: Set<string>;
  /** 마지막 스냅샷 이후 새로 눌린 키(반복 제외). */
  readonly keysHit: Set<string>;
  readonly buttonsDown: Set<number>;
  readonly buttonsHit: Set<number>;
  /** 마지막 스냅샷 이후 누적(CSS 픽셀, 휠은 노치 — 위로 굴림 +). */
  mouse: Record<MouseAxis, number>;
}

export function createRawInput(): RawInput {
  return {
    keysDown: new Set(),
    keysHit: new Set(),
    buttonsDown: new Set(),
    buttonsHit: new Set(),
    mouse: { x: 0, y: 0, wheel: 0 },
  };
}

export function keyDown(raw: RawInput, code: string, repeat: boolean): void {
  if (!repeat && !raw.keysDown.has(code)) raw.keysHit.add(code);
  raw.keysDown.add(code);
}

export function keyUp(raw: RawInput, code: string): void {
  raw.keysDown.delete(code);
}

export function buttonDown(raw: RawInput, button: number): void {
  if (!raw.buttonsDown.has(button)) raw.buttonsHit.add(button);
  raw.buttonsDown.add(button);
}

export function buttonUp(raw: RawInput, button: number): void {
  raw.buttonsDown.delete(button);
}

export function mouseMove(raw: RawInput, dx: number, dy: number): void {
  raw.mouse.x += dx;
  raw.mouse.y += dy;
}

/** deltaY > 0 = 아래로(사용자 쪽) 굴림 → 음수 노치. deltaMode: 0 픽셀, 1 줄, 2 페이지. */
export function wheel(raw: RawInput, deltaY: number, deltaMode: number): void {
  const notches =
    deltaMode === 0 ? deltaY / WHEEL_PX_PER_NOTCH : deltaMode === 1 ? deltaY / WHEEL_LINES_PER_NOTCH : deltaY;
  raw.mouse.wheel -= notches;
}

/** 포커스 상실 등: 눌림 상태를 모두 해제(키가 눌린 채로 남는 것 방지). */
export function releaseAll(raw: RawInput): void {
  raw.keysDown.clear();
  raw.buttonsDown.clear();
}

/** 스냅샷 직후 호출: 프레임 누적값 초기화. */
export function endFrame(raw: RawInput): void {
  raw.keysHit.clear();
  raw.buttonsHit.clear();
  raw.mouse.x = 0;
  raw.mouse.y = 0;
  raw.mouse.wheel = 0;
}
