// 부트 7–9단계 최소 조립(M01-T06): render + input + traversal(freecam) + 카메라 배선 + 임시 셀 로더. see docs/modules/game.md §부트 시퀀스
import type { EventBus, FrameSource, Logger, SystemProvider } from '@sanpo/core';
import { createInput, type InputService } from '@sanpo/input';
import { createRender, type RenderService } from '@sanpo/render';
import { createTraversal, type TraversalService } from '@sanpo/traversal';
import { createLocalGround, decodeLocalCell, type LocalGround } from './debug/local-cells.ts';
import { startFreecamPose } from './start-view.ts';
import { createCameraWiring } from './wiring/camera.ts';
import type { LoadedWorld } from './world-load.ts';

export interface WorldView {
  readonly render: RenderService;
  readonly input: InputService;
  readonly traversal: TraversalService;
  readonly ground: LocalGround;
  readonly providers: readonly SystemProvider[];
  readonly frameSource: FrameSource;
  /** 로드된 셀을 렌더에 추가하고 지면을 알게 된 뒤 시작 시점으로 이동. 추가한 셀 수. */
  showWorld(world: LoadedWorld): Promise<number>;
}

export interface WorldViewDeps {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  log: Logger;
  backend: 'auto' | 'webgl';
  now?: () => number;
}

export async function createWorldView(deps: WorldViewDeps): Promise<WorldView> {
  const { canvas, bus, log } = deps;
  const render = await createRender({ canvas, bus, log, config: { backend: deps.backend } });
  const input = createInput({ target: canvas, bus, log });
  const ground = createLocalGround();
  const traversal = createTraversal(
    { input, bus, log, ground },
    { initial: { mode: 'freecam', params: startFreecamPose(ground) } },
  );
  const now = deps.now ?? Date.now;
  const frameSource: FrameSource = {
    camera: () => traversal.camera,
    player: () => traversal.player,
    gameTimeMs: now,
    timeScale: () => 1,
  };
  const cameraWiring = createCameraWiring(traversal, render);

  return {
    render,
    input,
    traversal,
    ground,
    frameSource,
    providers: [input, traversal, { systems: () => [cameraWiring] }, render],
    async showWorld(world) {
      let added = 0;
      for (const cell of world.cells) {
        const p = await decodeLocalCell(cell);
        if (!p.ok) {
          log.child('world').error(p.error);
          continue;
        }
        render.addCell(p.value);
        if (p.value.heightfield) ground.addCell(p.value.key, p.value.originWF, p.value.heightfield);
        added++;
      }
      // 지면 높이를 알게 됐으니 "지면 위 60 m"를 정확히 다시 잡는다.
      traversal.request('freecam', startFreecamPose(ground));
      return added;
    },
  };
}
