// 렌더 시점 상태: WF 카메라(float64) 보관, 원점 재설정 판정·실행(origin/rebased), three 카메라에 렌더 좌표 대입. see docs/07-rendering.md §2
import { type CameraState, type EventBus, type Logger, quatCopy, type Vec3d, vec3Copy } from '@sanpo/core';
import { PerspectiveCamera } from 'three/webgpu';
import type { RenderConfig } from '../../api.ts';
import { needsRebase, snapOrigin, toRender } from './origin.ts';

export interface RenderView {
  readonly camera: PerspectiveCamera;
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly rebases: number;
  setCamera(c: Readonly<CameraState>): void;
  /** renderPrep: 필요 시 원점 재설정(onRebase로 노드 재배치) 후 카메라를 렌더 좌표로 대입. 같은 프레임 안이라 튐 없음. */
  prepare(onRebase: (originWF: Readonly<Vec3d>) => void): void;
}

export function createRenderView(cfg: Readonly<RenderConfig>, bus: EventBus, log: Logger): RenderView {
  const camera = new PerspectiveCamera(70, 1, 0.1, cfg.farM);
  const renderOriginWF: Vec3d = { x: 0, y: 0, z: 0 };
  const cam: CameraState = { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 70, near: 0.1 };
  let rebases = 0;

  const rebaseIfNeeded = (onRebase: (o: Readonly<Vec3d>) => void): void => {
    if (!needsRebase(cam.posWF, renderOriginWF, cfg.rebaseDistanceM)) return;
    const oldOrigin = { ...renderOriginWF };
    snapOrigin(renderOriginWF, cam.posWF, cfg.rebaseGridM);
    onRebase(renderOriginWF);
    rebases++;
    log.debug('origin rebased', oldOrigin, '→', { ...renderOriginWF });
    bus.emit('origin/rebased', { oldOrigin, newOrigin: { ...renderOriginWF } });
  };

  return {
    camera,
    renderOriginWF,
    get rebases() {
      return rebases;
    },
    setCamera(c) {
      vec3Copy(cam.posWF, c.posWF);
      quatCopy(cam.quat, c.quat);
      cam.fovDeg = c.fovDeg;
      cam.near = c.near;
    },
    prepare(onRebase) {
      rebaseIfNeeded(onRebase);
      toRender(camera.position, cam.posWF, renderOriginWF);
      camera.quaternion.set(cam.quat.x, cam.quat.y, cam.quat.z, cam.quat.w);
      if (camera.fov !== cam.fovDeg || camera.near !== cam.near) {
        camera.fov = cam.fovDeg;
        camera.near = cam.near;
        camera.updateProjectionMatrix();
      }
    },
  };
}
