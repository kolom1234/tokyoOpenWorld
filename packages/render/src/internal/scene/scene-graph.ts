// 씬 그래프 골격: scene → worldRoot(원점 고정) → 레이어 루트, skyRoot(카메라 상대). see docs/07-rendering.md §2
import type { MeshSlot } from '@sanpo/tile-format';
import { Color, Group, Scene } from 'three/webgpu';
import { createSunRig, type SunRig } from '../lighting/sun.ts';

/** 대기 산란(M03) 전 임시 하늘색(sRGB). */
const SKY_BACKGROUND = 0x9ec5ec;

export type LayerRoot = 'terrain' | 'road' | 'building' | 'override' | 'prop' | 'vegetation' | 'dynamic' | 'light';

/** 메시 슬롯 → 소속 레이어 루트. */
export const SLOT_ROOT: Readonly<Record<MeshSlot, LayerRoot>> = {
  terrain: 'terrain',
  roads: 'road',
  decals: 'road',
  buildings: 'building',
  overrides: 'override',
  hlod: 'building',
};

export interface SceneGraph {
  readonly scene: Scene;
  readonly worldRoot: Group;
  readonly roots: Readonly<Record<LayerRoot, Group>>;
  readonly skyRoot: Group;
  readonly sun: SunRig;
}

export function createSceneGraph(): SceneGraph {
  const scene = new Scene();
  scene.name = 'scene';
  scene.background = new Color(SKY_BACKGROUND);
  const worldRoot = new Group();
  worldRoot.name = 'worldRoot';
  const names: LayerRoot[] = ['terrain', 'road', 'building', 'override', 'prop', 'vegetation', 'dynamic', 'light'];
  const roots = {} as Record<LayerRoot, Group>;
  for (const n of names) {
    const g = new Group();
    g.name = `${n}Root`;
    roots[n] = g;
    worldRoot.add(g);
  }
  const skyRoot = new Group();
  skyRoot.name = 'skyRoot';
  const sun = createSunRig();
  roots.light.add(...sun.objects);
  scene.add(worldRoot, skyRoot);
  return { scene, worldRoot, roots, skyRoot, sun };
}
