// freecam G 카메라 아래 내리기 안내(ADR-0083 → M10-T01 UI HUD): 찾는 중 = 안내 칸 'landing', 실패 = 이유 알림(hud.landing seq가 바뀔 때만). 게임 로직 없음.
import type { GameSystem } from '@sanpo/core';
import type { TraversalService } from '@sanpo/traversal';
import { pushNotice, setPrompt } from './shell/hud-state.ts';

/** phase 67(HUD). */
export function landingHudSystem(doc: Document, traversal: TraversalService): GameSystem {
  let seq = -1;
  let state = '';
  let searching = false;
  return {
    id: 'wiring.landingHud',
    phase: 67,
    update() {
      const l = traversal.mode === 'freecam' ? traversal.hud.landing : undefined;
      if (searching && l?.state !== 'searching') {
        setPrompt(doc, 'landing', null);
        searching = false;
      }
      if (!l || (l.seq === seq && l.state === state)) return;
      seq = l.seq;
      state = l.state;
      if (l.state === 'searching') {
        setPrompt(doc, 'landing', { key: 'hud.prompt.landingSearch' });
        searching = true;
      } else pushNotice(doc, { key: `hud.landing.${l.reason ?? 'not-ready'}` });
    },
    dispose() {
      setPrompt(doc, 'landing', null);
    },
  };
}
