// 프레임 시스템: renderPrep(70: 캔버스 크기·원점 재설정·카메라·HLOD 페이드) / render(80). see docs/01-architecture.md §5, docs/07-rendering.md §1–3
import type { GameSystem } from '@sanpo/core';
import { type PerspectiveCamera, Quaternion, Vector2, Vector3, type WebGPURenderer } from 'three/webgpu';
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

/** 그림자 캐시용 카메라 변화 감지(렌더 좌표 위치·방향·투영). 1 mm·≈ 0.01° 미만은 정지로 본다. */
function createMotionProbe(camera: PerspectiveCamera): () => boolean {
  const pos = new Vector3(Number.NaN, 0, 0);
  const quat = new Quaternion();
  let proj = '';
  return () => {
    const p = `${camera.fov}|${camera.aspect}|${camera.near}`;
    const moved =
      camera.position.distanceToSquared(pos) > 1e-6 || 1 - Math.abs(camera.quaternion.dot(quat)) > 1e-8 || p !== proj;
    pos.copy(camera.position);
    quat.copy(camera.quaternion);
    proj = p;
    return moved;
  };
}

const scratchCam = { x: 0, y: 0, z: 0 };

/** 소품·나무 LOD·간판 채우기(카메라 WF = 렌더 원점 + 카메라 렌더 좌표). 반환 = 풀을 다시 채웠는지. */
function syncProps(ctx: RenderContext, rebased: boolean): boolean {
  const { camera, renderOriginWF: o } = ctx.view;
  scratchCam.x = o.x + camera.position.x;
  scratchCam.y = o.y + camera.position.y;
  scratchCam.z = o.z + camera.position.z;
  const props = ctx.props.update(scratchCam, o, rebased);
  if (ctx.signalLamp) ctx.props.updateSignals(ctx.signalLamp);
  const signs = ctx.signs.update(scratchCam, o, rebased);
  const crowd = ctx.crowd.update(camera, o);
  // 둘 다 매 프레임 갱신(|| 단락 평가로 열차 풀이 멈추지 않게 — M07-T04에서 발견).
  const cars = ctx.vehicles.update(camera, o);
  const trains = ctx.trains.update(camera, o);
  const vehicles = cars || trains;
  ctx.farCrowd.update(camera, o, performance.now() / 1000);
  return ctx.trees.update(scratchCam, o, rebased) || props || signs || crowd || vehicles;
}

export function createFrameSystems(ctx: RenderContext): { prep: GameSystem; draw: GameSystem } {
  const { renderer, view, cells, library, hlod, counters } = ctx;
  const moved = createMotionProbe(view.camera);
  let sceneVersion = -1;
  const prep: GameSystem = {
    id: 'renderPrep',
    phase: RENDER_PREP_PHASE,
    update(f) {
      syncSize(renderer, view.camera, ctx.canvas, ctx.cfg.maxPixelRatio);
      let rebased = false;
      view.prepare((origin) => {
        cells.placeAll(origin);
        ctx.atmosphere.setOrigin(origin);
        rebased = true;
      });
      library.setOrigin(view.renderOriginWF);
      if (syncProps(ctx, rebased)) counters.sceneVersion++;
      ctx.avatar.update(f.dtReal, view.renderOriginWF);
      counters.fading = hlod.update(f.dtReal);
      cells.syncHlodMaterials();
      const sceneChanged = counters.sceneVersion !== sceneVersion || counters.fading > 0;
      sceneVersion = counters.sceneVersion;
      counters.shadowUpdates = ctx.shadows?.schedule({ moved: moved(), sceneChanged, rebased }) ?? 0;
    },
    dispose() {},
  };
  const draw: GameSystem = {
    id: 'render',
    phase: RENDER_PHASE,
    update(f) {
      ctx.post.render(f.dtReal);
      ctx.quality.onFrame(f.dtReal);
      ctx.gpuTimer.afterFrame();
      counters.frames++;
    },
    dispose() {
      cells.dispose();
      ctx.props.dispose();
      ctx.trees.dispose();
      ctx.signs.dispose();
      ctx.crowd.dispose();
      ctx.vehicles.dispose();
      ctx.trains.dispose();
      ctx.avatar.dispose();
      ctx.quality.dispose();
      ctx.post.dispose();
      ctx.env.dispose();
      ctx.shadows?.dispose();
      ctx.atmosphere.dispose();
      ctx.materials.dispose();
      library.dispose();
      renderer.dispose();
    },
  };
  return { prep, draw };
}
