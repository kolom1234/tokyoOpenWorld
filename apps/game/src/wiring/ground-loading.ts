// 배선: 발밑·앞 셀 콜라이더 적재 대기(traversal.hud.groundLoading, M04-T06) → 화면 아래 가운데 작은 로딩 표시. HUD(M08 ui) 전까지의 최소 표시.
// see docs/08-physics.md §4 groundMissing, docs/modules/game.md
import type { GameSystem } from '@sanpo/core';
import type { TraversalService } from '@sanpo/traversal';

/** camera 배선(65) 뒤, renderPrep(70) 앞 — DOM만 만진다. */
export const GROUND_LOADING_PHASE = 66;
/** 짧은 대기(1–2 프레임)는 깜빡이지 않게 이만큼 이어질 때만 보인다(s). */
const SHOW_AFTER_S = 0.2;

export function createGroundLoadingIndicator(doc: Document, traversal: Pick<TraversalService, 'hud'>): GameSystem {
  const el = doc.createElement('div');
  el.className = 'ground-loading';
  el.setAttribute('role', 'status');
  el.textContent = '지면 불러오는 중…';
  el.hidden = true;
  doc.body.append(el);
  let waitingS = 0;
  return {
    id: 'wiring/ground-loading',
    phase: GROUND_LOADING_PHASE,
    update(f) {
      waitingS = traversal.hud.groundLoading ? waitingS + f.dtReal : 0;
      const show = waitingS >= SHOW_AFTER_S;
      if (el.hidden === show) el.hidden = !show;
      el.dataset.waiting = String(traversal.hud.groundLoading === true);
    },
    dispose() {
      el.remove();
    },
  };
}
