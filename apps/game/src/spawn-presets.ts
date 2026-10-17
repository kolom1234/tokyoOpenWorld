// URL 스폰 프리셋(ADR-0084 — M10 지도 전 임시): `?spawn=<id>` → content/spawn-presets.json의 위치·방위로 월드 스폰을 바꾼다
// (부팅 대기 중심·스폰 3×3 셀·물리 앵커·첫 walk 착지가 모두 그 자리). surface 'platform' = 철도 적재 뒤 승강장 윗면 안전 자리로, 'exact' = 그 자리 아래 바닥(처마·차양 아래)으로 한 번 옮김(world-extras).
import PRESETS from '../../../content/spawn-presets.json';
import { cellsAroundSpawn, type LoadedWorld } from './world-load.ts';

export interface SpawnPreset {
  id: string;
  name: { ja: string; en: string; ko: string };
  posWF: [number, number, number];
  yawDeg: number;
  surface?: 'platform' | 'exact';
  /** 시작할 때 세워 둘 카셰어 차(M08-T01 — 차체 바닥 중심 WF·전방 방위 deg, 0 = 북 −Z). */
  vehicles?: { posWF: [number, number, number]; yawDeg: number; kind?: 'sedan' | 'bicycle' }[];
}

export const SPAWN_PRESETS = (PRESETS as unknown as { presets: SpawnPreset[] }).presets;

export function spawnPreset(id: string | undefined): SpawnPreset | undefined {
  return id === undefined ? undefined : SPAWN_PRESETS.find((p) => p.id === id);
}

/** 로드된 월드의 스폰을 프리셋으로(스폰 셀 = 그 둘레 3×3 중 색인에 있는 것). */
export function withSpawn(world: LoadedWorld, p: SpawnPreset): LoadedWorld {
  const [x, y, z] = p.posWF;
  return {
    ...world,
    spawnWF: { x, y, z },
    spawnYawRad: (p.yawDeg * Math.PI) / 180,
    spawnCells: cellsAroundSpawn(world.cellsIndex, p.posWF),
  };
}
