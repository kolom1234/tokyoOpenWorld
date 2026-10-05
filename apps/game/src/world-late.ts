// 첫 표시 뒤 적재(world-view에서 분리 — 400줄 한도): 머티리얼·아바타·나무·간판·군중(sim.worker + 군중 팩)·신호 램프. 실패하면 그 요소 없이 계속.
// see docs/modules/game.md §부트 시퀀스
import type { GameSystem, GroundQuery, Logger, WorkerSupervisor } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { AvatarAssetUrls, CrowdAssetUrls, RenderService, SignageAssetUrls, TreeAssetUrls } from '@sanpo/render';
import type { CrowdParams, SimService, TrafficParams } from '@sanpo/sim';
import type { StreamingService } from '@sanpo/streaming';
import CROWD_PARAMS from '../../../content/sim/crowd.json';
import SIGNAL_PLANS from '../../../content/sim/signal-plans.json';
import TRAFFIC_PARAMS from '../../../content/sim/traffic.json';
import type { BootStage } from './boot-progress.ts';
import type { StreamingPhysicsWiring } from './wiring/streaming-physics.ts';
import type { StreamingRenderWiring } from './wiring/streaming-render.ts';
import type { StreamingSimWiring } from './wiring/streaming-sim.ts';
import type { LoadedWorld } from './world-load.ts';

/** 월드 로드 뒤 생기는 것들(getter로 노출). */
export interface LateState {
  streaming?: StreamingService;
  wiring?: StreamingRenderWiring;
  physics?: PhysicsService;
  physicsWiring?: StreamingPhysicsWiring;
  materialsSettled: boolean;
  avatarSettled: boolean;
  treesSettled: boolean;
  signsSettled: boolean;
  /** 군중 팩 적재가 끝났거나(성공·실패) 군중 없음(골든뷰 안정 조건, M06-T07). */
  crowdSettled: boolean;
  /** streaming → sim nav(M06-T03). 군중 off면 없음. */
  simWiring?: StreamingSimWiring;
  /** startStreaming이 만든 워커 감독자(sim.worker도 같이 — M06-T01). */
  supervisor?: WorkerSupervisor;
  /** 부팅 준비 단계(bootProgress): 선컴파일 글·스폰 셀 목록·끝남. */
  boot: BootStage;
}

/** 텍스처는 첫 표시 뒤(초기 다운로드 예산 밖, 14 §2). 실패하면 평균색으로 계속. */
export function loadMaterialsLater(render: RenderService, url: string | undefined, late: LateState, log: Logger): void {
  if (url === undefined) {
    late.materialsSettled = true;
    return;
  }
  void render
    .loadMaterials(url)
    .catch((e: unknown) => log.warn('materials', e))
    .finally(() => {
      late.materialsSettled = true;
    });
}

/** 플레이어 아바타(파이프라인 `characters`, Microsoft Rocketbox MIT — ADR-0057). Vite가 해시 에셋으로 만든다(/assets/*, immutable). */
export const AVATAR_URLS: AvatarAssetUrls = {
  glb: new URL('./assets/characters/avatar-rb.glb', import.meta.url).href,
  texture: new URL('./assets/characters/avatar-rb.ktx2', import.meta.url).href,
};

/** 아바타 모델도 첫 표시 뒤(초기 다운로드 예산 밖). 실패하면 절차 마네킹. */
export function loadAvatarLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadAvatar(AVATAR_URLS)
    .catch((e: unknown) => log.warn('avatar', e))
    .finally(() => {
      late.avatarSettled = true;
    });
}

/** 나무 에셋(파이프라인 `trees` — ez-tree 수종·자체 잎·임포스터 아틀라스, ADR-0052). Vite 해시 에셋. */
export const TREE_URLS: TreeAssetUrls = {
  manifest: new URL('./assets/trees/trees.json', import.meta.url).href,
  glb: new URL('./assets/trees/trees.glb', import.meta.url).href,
  leaves: new URL('./assets/trees/leaves.png', import.meta.url).href,
  impostor: new URL('./assets/trees/impostor-color.png', import.meta.url).href,
};

/** 간판 아틀라스(파이프라인 `signage` — 가상 브랜드, ADR-0054). Vite 해시 에셋. */
export const SIGNAGE_URLS: SignageAssetUrls = {
  atlas: new URL('./assets/signage/atlas.png', import.meta.url).href,
};

/** 군중 팩(파이프라인 `characters` 군중 — Rocketbox 베이스 12종, ADR-0057). Vite 해시 에셋. */
export const CROWD_URLS: CrowdAssetUrls = {
  manifest: new URL('./assets/characters/crowd.json', import.meta.url).href,
  bin: new URL('./assets/characters/crowd.bin', import.meta.url).href,
  texture: new URL('./assets/characters/crowd.ktx2', import.meta.url).href,
};

/** 군중 모드(`?crowd=`): agents(기본) | dummy | scramble(agents + 시험 장면) | off. */
export type CrowdMode = 'agents' | 'dummy' | 'scramble' | 'off';

/** 스크램블 시험 장면(M06-T03 수락): 신호 계획 첫 사이트(渋谷スクランブル) 반경 45 m 횡단 대기점에 250명. */
const SCRAMBLE_SCENE = { radius: 45, count: 250 };

/**
 * 군중: 첫 표시 뒤 sim.worker 시작(agents = DetourCrowd tier A, dummy = 원형 걷기) → render.pedestrians 연결 → 군중 팩 적재(≈ 3.9 MB). 실패 = 군중 없이.
 * 교통(M06-T05·T06): 같은 워커 — 차량 SAB → render.vehicles, sim ↔ physics 직결 포트.
 */
export function startCrowdLater(
  v: { render: RenderService; sim: SimService; ground: GroundQuery; late: LateState },
  world: LoadedWorld,
  o: { mode: Exclude<CrowdMode, 'off'>; traffic: boolean },
  log: Logger,
): void {
  const mode = o.mode;
  const s = world.spawnWF;
  const centerWF = { x: s.x, y: v.ground.groundHeightAt(s.x, s.z) ?? s.y, z: s.z };
  const supervisor = v.late.supervisor;
  const crowd = CROWD_PARAMS as unknown as CrowdParams;
  const buf = supervisor
    ? v.sim.startWorker({
        supervisor,
        crowd,
        centerWF,
        mode: mode === 'dummy' ? 'dummy' : 'agents',
        ...(o.traffic ? { traffic: TRAFFIC_PARAMS as unknown as TrafficParams } : {}),
      })
    : undefined;
  if (!buf) {
    v.late.crowdSettled = true;
    return;
  }
  v.render.pedestrians.bindShared(buf);
  // 차량(M06-T06): 교통 SAB → render 차량 레이어, sim → physics 직결 포트(플레이어 60 m 안 키네마틱 바디).
  const traffic = v.sim.outputs().traffic;
  if (traffic) void v.render.vehicles.bindShared(traffic).catch((e: unknown) => log.warn('vehicles', e));
  const physics = v.late.physics;
  if (physics) v.sim.connectPhysics((port) => physics.connectKinematicSource(port));
  void v.render
    .loadCrowd(CROWD_URLS)
    .catch((e: unknown) => log.warn('crowd', e))
    .finally(() => {
      v.late.crowdSettled = true;
    });
  const c = SIGNAL_PLANS.sites[0]?.centerWF;
  if (mode === 'scramble' && c?.[0] !== undefined && c[1] !== undefined)
    v.sim.crowdScenario({ x: c[0], y: 0, z: c[1] }, SCRAMBLE_SCENE.radius, SCRAMBLE_SCENE.count);
}

/** 원경 군중 밀도(M06-T04): 1 s마다 sim 군중 수(A + B) ÷ 목표 최대(maxA + maxB) → render 원경 스프라이트(시간대·날씨가 원경에도). */
export function crowdFarDensitySystem(sim: SimService, render: RenderService): GameSystem {
  const a = (CROWD_PARAMS as unknown as CrowdParams).agents;
  const max = a ? a.maxA + a.maxB : 0;
  let acc = 0;
  return {
    id: 'wiring/crowd-far-density',
    phase: 66,
    update(f) {
      acc += f.dtReal;
      if (acc < 1 || max === 0) return;
      acc = 0;
      const c = sim.workerStats()?.crowd;
      if (c) render.pedestrians.setFarDensity((c.agents + c.flow) / max);
    },
    dispose() {},
  };
}

/** 신호 램프(M06-T02): sim 상태 → 램프 값. 보행 녹색 점멸 = 0.5 s 켜짐/꺼짐(실시간 — 정지 시계에서도 깜빡임). */
export function signalLampsOf(sim: SimService): (code: number) => number {
  const VEH = { R: 1, Y: 2, G: 3 } as const;
  return (code) => {
    const s = sim.signalStateAt(code);
    if (code % 4 < 2) return VEH[s.vehicle];
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    return 4 * (s.ped === 'D' ? 1 : s.ped === 'W' || blink ? 2 : 0);
  };
}

/** 간판도 첫 표시 뒤(≈ 0.25 MB). 실패하면 무지 간판·간판 인스턴스 없이. */
export function loadSignageLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadSignage(SIGNAGE_URLS)
    .catch((e: unknown) => log.warn('signage', e))
    .finally(() => {
      late.signsSettled = true;
    });
}

/** 나무도 첫 표시 뒤(초기 다운로드 밖, ≈ 1.6 MB). 실패하면 나무 없이. */
export function loadTreesLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadTrees(TREE_URLS)
    .catch((e: unknown) => log.warn('trees', e))
    .finally(() => {
      late.treesSettled = true;
    });
}
