// 프레임 시스템: renderPrep(70: 캔버스 크기·원점 재설정·카메라·HLOD 페이드) / render(80). see docs/01-architecture.md §5, docs/07-rendering.md §1–3
import type { GameSystem } from '@sanpo/core';
import { type PerspectiveCamera, Vector2, type WebGPURenderer } from 'three/webgpu';
import type { RenderContext } from './context.ts';

/** 01-architecture §5 phase 표. */
export const RENDER_PREP_PHASE = 70;
export const RENDER_PHASE = 80;

const scratchSize = new Vector2();

/** CSS 크기·DPR이 바뀐 경우에만 드로잉 버퍼 크기 갱신. */
function syncSize(renderer: WebGPURenderer, camera: PerspectiveCamera, canvas: HTMLCanvasElement, maxDpr: number) {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(globalThis.devicePixelRatio ?? 1, maxDpr);
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  const size = renderer.getSize(scratchSize);
  if (size.x !== w || size.y !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export function createFrameSystems(ctx: RenderContext): { prep: GameSystem; draw: GameSystem } {
  const { renderer, view, cells, library, hlod, counters } = ctx;
  const prep: GameSystem = {
    id: 'renderPrep',
    phase: RENDER_PREP_PHASE,
    update(f) {
      syncSize(renderer, view.camera, ctx.canvas, ctx.cfg.maxPixelRatio);
      view.prepare((origin) => {
        cells.placeAll(origin);
        ctx.atmosphere.setOrigin(origin);
      });
      library.setOrigin(view.renderOriginWF);
      counters.fading = hlod.update(f.dtReal);
    },
    dispose() {},
  };
  const draw: GameSystem = {
    id: 'render',
    phase: RENDER_PHASE,
    update() {
      ctx.post.render();
      ctx.gpuTimer.afterFrame();
      counters.frames++;
    },
    dispose() {
      cells.dispose();
      ctx.post.dispose();
      ctx.env.dispose();
      ctx.atmosphere.dispose();
      ctx.materials.dispose();
      library.dispose();
      renderer.dispose();
    },
  };
  return { prep, draw };
}
