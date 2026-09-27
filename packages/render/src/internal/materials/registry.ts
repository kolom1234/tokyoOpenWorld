// 머티리얼 ID → 공유 머티리얼(M01 최소: 단색 PBR). 07 §4 고정 클래스·TSL 파사드는 M03. see docs/07-rendering.md §3–4
import { type Material, MeshStandardNodeMaterial } from 'three/webgpu';

/** 파이프라인 머티리얼 ID(ADR-0018 §5 glTF extras.materialId)별 임시 색(sRGB)·거칠기. */
const BASIC_MATERIALS: Readonly<Record<string, { color: number; roughness: number }>> = {
  terrain_ground: { color: 0x8a8a80, roughness: 0.95 },
  facade_default: { color: 0xd8d4cc, roughness: 0.8 },
};
/** 모르는 ID: 눈에 띄는 색(누락 확인용). */
const FALLBACK = { color: 0xff00ff, roughness: 0.5 };

export interface MaterialRegistry {
  get(materialId: string): Material;
  dispose(): void;
}

export function createMaterialRegistry(): MaterialRegistry {
  const cache = new Map<string, Material>();
  return {
    get(id) {
      let m = cache.get(id);
      if (m === undefined) {
        const spec = BASIC_MATERIALS[id] ?? FALLBACK;
        m = new MeshStandardNodeMaterial({ color: spec.color, roughness: spec.roughness, metalness: 0 });
        m.name = id;
        cache.set(id, m);
      }
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
    },
  };
}
