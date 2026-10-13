// 월드 표시 직후 붙는 부가 배선(world-view.ts 400줄 제한으로 분리): 오디오(M09-T04) + 역 시설·동선(M07-T06).
import type { AudioService } from '@sanpo/audio';
import type { GroundQuery, Logger, Scheduler } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { RenderService } from '@sanpo/render';
import type { SimService } from '@sanpo/sim';
import type { StreamingService } from '@sanpo/streaming';
import type { TraversalService } from '@sanpo/traversal';
import ACCESS from '../../../content/stations/access.json';
import type { AccessFile } from './station/layout.ts';
import { stationSystem } from './station/wiring.ts';
import type { StreamingRenderWiring } from './wiring/streaming-render.ts';
import { type AudioFlags, audioForWorld } from './world-audio.ts';
import type { LateState } from './world-late.ts';

export function startWorldExtras(
  deps: { canvas: HTMLCanvasElement; log: Logger; audio?: AudioFlags; scheduler: Pick<Scheduler, 'add'> },
  v: {
    render: RenderService;
    input: InputService;
    traversal: TraversalService;
    ground: GroundQuery;
    sim: SimService;
    streaming: StreamingService;
    cells: Pick<StreamingRenderWiring, 'onCell'>;
  },
  baseUrl: string,
  late: LateState,
): AudioService | undefined {
  const audio = audioForWorld(deps, v, baseUrl, () => late.physics);
  const stations = stationSystem({
    doc: deps.canvas.ownerDocument,
    access: ACCESS as unknown as AccessFile,
    render: v.render,
    input: v.input,
    traversal: v.traversal,
    sim: v.sim,
    physics: () => late.physics,
    audio: () => late.audio,
  });
  deps.scheduler.add({ systems: () => [stations] });
  return audio;
}
