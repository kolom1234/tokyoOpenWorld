// 메뉴 일시정지(M10-T01): 게임 입력 끔(input.setEnabled) + 포인터 잠금 풀기 + 사용자 시계(custom)면 시계 멈춤. 재개 = 반대(+ 제스처 안이면 포인터 잠금 다시).
// 메뉴 모드에서는 포인터 잠금이 풀리면(Esc — 잠금 중 Esc는 페이지에 오지 않는다·창 전환) 일시정지 메뉴를 연다. 물리도 멈춘다(physics.setPaused — 차·자전거·캐릭터 제자리).
import type { ClockMode } from '@sanpo/sim';
import type { UiHandle } from '@sanpo/ui';
import type { WorldView } from '../world-view.ts';

export interface PauseControl {
  set(on: boolean): void;
  readonly paused: boolean;
  /** 포인터 잠금 풀림 → 일시정지(menus일 때만). 반환 = 해제. */
  autoPause(ui: UiHandle, menus: boolean): () => void;
}

export function createPause(doc: Document, world: () => WorldView | undefined): PauseControl {
  let paused = false;
  let resumeClock: ClockMode | undefined;
  let intentional = false;
  let screenUi: UiHandle | undefined;
  return {
    get paused() {
      return paused;
    },
    set(on) {
      const w = world();
      if (on === paused) return;
      paused = on;
      w?.input.setEnabled(!on);
      w?.physics?.setPaused(on);
      if (on) {
        if (doc.pointerLockElement) {
          intentional = true;
          doc.exitPointerLock();
        }
        const c = w?.sim.clock;
        if (c && c.mode === 'custom') {
          resumeClock = { kind: 'custom', startMs: c.gameTimeMs, scale: c.timeScale as 1 | 2 | 10 | 60 };
          c.setMode({ kind: 'frozen', atMs: c.gameTimeMs });
        }
        return;
      }
      if (resumeClock && w) {
        w.sim.clock.setMode({ ...resumeClock, startMs: w.sim.clock.gameTimeMs } as ClockMode);
        resumeClock = undefined;
      }
      // 재개 버튼(클릭·Enter)은 사용자 제스처 → 잠금 요청이 받아들여진다. 패드는 거부(조용히 무시 — 캔버스 클릭으로 잠금).
      // 포토 모드는 커서가 있어야 한다(패널·끌기·우클릭 초점) — 일시정지 → 포토 모드면 잠그지 않는다.
      if (screenUi?.screen.peek() === 'photo') return;
      const canvas = doc.getElementById('view');
      try {
        const r = canvas?.requestPointerLock?.() as unknown as Promise<void> | undefined;
        r?.catch?.(() => undefined);
      } catch {
        // 제스처 밖 — 무시
      }
    },
    autoPause(ui, menus) {
      screenUi = ui;
      if (!menus) return () => undefined;
      const onChange = () => {
        if (doc.pointerLockElement) return;
        if (intentional) {
          intentional = false;
          return;
        }
        if (ui.screen.peek() === 'hud') ui.open('pause');
      };
      doc.addEventListener('pointerlockchange', onChange);
      return () => doc.removeEventListener('pointerlockchange', onChange);
    },
  };
}
