// 머티리얼 ID → 공유 머티리얼 + HLOD 변형(자식 페이드, M02-T05). 셀 머티리얼은 라이브러리 텍스처 배열을 쓴다(M03-T01, 적재 전 평균색).
// see docs/07-rendering.md §3–4
import { type Material, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import type { EnvUniforms } from '../weather/wetness.ts';
import { createFacadeMaterial } from './facade/index.ts';
import { createHlodMaterial } from './hlod.ts';
import type { MaterialLibrary } from './library.ts';
import { createTerrainMaterial } from './terrain.ts';

/** 파이프라인 머티리얼 ID(ADR-0018 §5 glTF extras.materialId)별 생성기. HLOD는 단색(원거리 — 07 §3). */
const CELL_MATERIALS: Readonly<Record<string, (lib: MaterialLibrary, env: EnvUniforms) => Material>> = {
  terrain_ground: createTerrainMaterial,
  facade_default: createFacadeMaterial,
};
const HLOD_COLORS: Readonly<Record<string, { color: number; roughness: number }>> = {
  terrain_ground: { color: 0x8a8a80, roughness: 0.95 },
  facade_default: { color: 0xd8d4cc, roughness: 0.8 },
};
/** 모르는 ID: 눈에 띄는 색(누락 확인용). */
const FALLBACK = { color: 0xff00ff, roughness: 0.5 };

export interface MaterialRegistry {
  get(materialId: string): Material;
  /** hlod.mesh용(자식 붕괴). fading = alphaHash 디더 변형(페이드 중인 셀만, ADR-0039). */
  getHlod(materialId: string, fading?: boolean): Material;
  /** 깊이만 쓰는 프리패스(건물 파사드 먼저 → 가려진 파사드·지면 셰이딩 생략, ADR-0039). */
  prepass(): Material;
  /** 지금까지 만든 머티리얼(선컴파일 대상). */
  all(): Material[];
  dispose(): void;
}

/** 부팅 시 선컴파일할 ID(06 §6). */
export const PRECOMPILE_IDS = Object.keys(CELL_MATERIALS);

export function createMaterialRegistry(
  lib: MaterialLibrary,
  env: EnvUniforms,
  facade: 'procedural' | 'flat' = 'procedural',
): MaterialRegistry {
  const cache = new Map<string, Material>();
  const hlod = new Map<string, Material>();
  let prepass: Material | undefined;
  return {
    get(id) {
      let m = cache.get(id);
      if (m === undefined) {
        const make = id === 'facade_default' && facade === 'flat' ? undefined : CELL_MATERIALS[id];
        if (make) m = make(lib, env);
        else if (id === 'facade_default') {
          m = new MeshStandardNodeMaterial({ color: 0xd8d4cc, roughness: 0.8, metalness: 0 });
          m.name = id;
        } else {
          m = new MeshStandardNodeMaterial({ color: FALLBACK.color, roughness: FALLBACK.roughness, metalness: 0 });
          m.name = id;
        }
        cache.set(id, m);
      }
      return m;
    },
    getHlod(id, fading = false) {
      const key = fading ? `${id}:fade` : id;
      let m = hlod.get(key);
      if (m === undefined) {
        const spec = HLOD_COLORS[id] ?? FALLBACK;
        m = createHlodMaterial(id, spec.color, spec.roughness, fading);
        hlod.set(key, m);
      }
      return m;
    },
    prepass() {
      if (prepass === undefined) {
        prepass = new MeshBasicNodeMaterial();
        prepass.name = 'depth_prepass';
        prepass.colorWrite = false;
      }
      return prepass;
    },
    all: () => [...cache.values(), ...hlod.values(), ...(prepass ? [prepass] : [])],
    dispose() {
      prepass?.dispose();
      prepass = undefined;
      for (const m of [...cache.values(), ...hlod.values()]) m.dispose();
      cache.clear();
      hlod.clear();
    },
  };
}
