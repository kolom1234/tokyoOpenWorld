// 배선: traversal 카메라·아바타(phase 20 확정) → render.setCamera·setAvatar(renderPrep 70 이전). see docs/modules/game.md, docs/01-architecture.md §5
import type { GameSystem } from '@sanpo/core';
import type { RenderService } from '@sanpo/render';
import type { TraversalService } from '@sanpo/traversal';

/** traversalPost(35)·simSync(40) 뒤, renderPrep(70) 앞. */
export const CAMERA_WIRING_PHASE = 65;

export function createCameraWiring(traversal: TraversalService, render: RenderService): GameSystem {
  return {
    id: 'wiring/camera',
    phase: CAMERA_WIRING_PHASE,
    update: () => {
      render.setCamera(traversal.camera);
      render.setAvatar(traversal.avatar);
    },
    dispose() {},
  };
}
