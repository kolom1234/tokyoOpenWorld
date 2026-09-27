// 마우스 디바이스: 클릭 → Pointer Lock, 이동(잠금 중 또는 버튼 드래그 중)·버튼·휠 → RawInput. see docs/09-traversal.md §4
import { buttonDown, buttonUp, mouseMove, type RawInput, wheel } from '../raw-input.ts';

export interface MouseDevice {
  readonly locked: boolean;
  detach(): void;
}

/**
 * 시점 회전은 Pointer Lock 중이면 항상, 아니면 버튼을 누른 채 드래그할 때만 누적한다
 * (Pointer Lock이 거부되는 환경 — iframe·자동화 — 에서도 조작 가능하게).
 */
export function attachMouse(target: HTMLElement, raw: RawInput): MouseDevice {
  const doc = target.ownerDocument;
  const locked = (): boolean => doc.pointerLockElement === target;
  const onClick = (): void => {
    if (locked()) return;
    // 사용자 제스처 없는 호출·지원 안 함은 거부(Promise reject 또는 예외) → 드래그 조작으로 대체.
    try {
      const p = target.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch(() => undefined);
    } catch {
      /* 드래그 조작으로 대체 */
    }
  };
  const onDown = (e: PointerEvent): void => buttonDown(raw, e.button);
  const onUp = (e: PointerEvent): void => buttonUp(raw, e.button);
  const onMove = (e: PointerEvent): void => {
    if (locked() || e.buttons !== 0) mouseMove(raw, e.movementX, e.movementY);
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    wheel(raw, e.deltaY, e.deltaMode);
  };
  const onContext = (e: Event): void => e.preventDefault();
  target.addEventListener('click', onClick);
  target.addEventListener('pointerdown', onDown);
  doc.addEventListener('pointerup', onUp);
  doc.addEventListener('pointermove', onMove);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onContext);
  return {
    get locked() {
      return locked();
    },
    detach() {
      target.removeEventListener('click', onClick);
      target.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointermove', onMove);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('contextmenu', onContext);
    },
  };
}
