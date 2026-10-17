// 차량 레이어 API(M06-T06 교통 + M08-T01 플레이어 차): 머티리얼 1개 공유(그림자 티어 재컴파일 목록 vehicleMaterials), 처음 쓸 때 장면 밖 선컴파일 뒤 그리기.
import type { SharedInstanceBuffer } from '@sanpo/core';
import type { Material } from 'three/webgpu';
import type { VehicleLayer } from '../api.ts';
import type { RenderContext } from './context.ts';
import { compileDetached } from './materials/precompile.ts';
import { createVehicleMaterial } from './vehicles/material.ts';

/** 플레이어 차 선컴파일 차종(VEHICLE_TYPES 순번 — 세단). */
const PLAYER_TYPES = [0] as const;

export function createVehicleLayer(ctx: RenderContext): VehicleLayer {
  let material: Material | undefined;
  const shared = (): Material => {
    if (!material) {
      material = createVehicleMaterial(ctx.vehicleUniforms);
      ctx.vehicleMaterials.push(material);
    }
    return material;
  };
  let players: Promise<void> | undefined;
  let playersReady = false;
  const preparePlayers = (): Promise<void> => {
    players ??= (async () => {
      const t0 = performance.now();
      ctx.players.attach(shared());
      await compileDetached(ctx.renderer, ctx.players.root, ctx.view.camera, ctx.graph.scene, () =>
        ctx.players.primeForCompile(PLAYER_TYPES),
      );
      playersReady = true;
      ctx.log.info(`player vehicles ready ${Math.round(performance.now() - t0)} ms`);
    })();
    return players;
  };
  return {
    async bindShared(buf: SharedInstanceBuffer) {
      if (!ctx.vehicles.stats().ready) {
        const t0 = performance.now();
        ctx.vehicles.attach(shared());
        await compileDetached(ctx.renderer, ctx.vehicles.root, ctx.view.camera, ctx.graph.scene, () =>
          ctx.vehicles.primeForCompile(),
        );
        ctx.log.info(`vehicles attached ${Math.round(performance.now() - t0)} ms`);
      }
      ctx.vehicles.bind(buf);
    },
    preparePlayers,
    setPlayers(list) {
      if (!playersReady) {
        void preparePlayers();
        return;
      }
      ctx.players.set(list);
      ctx.counters.sceneVersion++;
    },
  };
}
