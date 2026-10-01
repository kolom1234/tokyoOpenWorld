// 셰이더 선컴파일(06 §6): 고정 머티리얼 ID별 기본·HLOD 변형을 작은 더미 메시로 씬에 잠깐 붙여 `compileAsync` → 스트리밍 중 첫 사용 끊김 제거.
// 더미 정점 속성은 실제 셀과 같은 이름·형식이어야 같은 파이프라인이 캐시된다(dummyGeometry).
import type { Logger } from '@sanpo/core';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Group,
  type Material,
  Mesh,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { createHlodFades } from './hlod.ts';
import { HLOD_MATERIAL_IDS, type MaterialRegistry, PRECOMPILE_IDS } from './registry.ts';

/** 실제 셀과 같은 속성 형식(cell-node 변환 후): 지형 f32 위치·f32 `_surf`, 건물 u16 위치·f32 UV·f32 `_bldg`·unorm8×4 `_facade`, 노면 표시 u16 위치·f32 `_paint`, 전선 u16 위치·snorm8 `_off`, 랜드마크 u16 위치·f32 UV·f32 `_lmat`, HLOD u16 위치·f32 `_child`. */
function dummyGeometry(id: string, hlod: boolean): BufferGeometry {
  const g = new BufferGeometry();
  const quantized = hlod || ['facade_default', 'road_marking', 'power_wire', 'landmark'].includes(id);
  const pos = quantized ? new Uint16Array([0, 0, 0, 1, 0, 0, 0, 0, 1]) : new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
  if (hlod) g.setAttribute('_child', new BufferAttribute(new Float32Array(3), 1));
  else if (id === 'terrain_ground') g.setAttribute('_surf', new BufferAttribute(new Float32Array(3), 1));
  else if (id === 'road_marking') g.setAttribute('_paint', new BufferAttribute(new Float32Array(3), 1));
  else if (id === 'power_wire') g.setAttribute('_off', new BufferAttribute(new Int8Array(9), 3, true));
  else if (id === 'landmark') {
    g.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
    g.setAttribute('_lmat', new BufferAttribute(new Float32Array(3), 1));
  } else if (id === 'facade_default') {
    g.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
    g.setAttribute('uv1', new BufferAttribute(new Float32Array(6), 2));
    g.setAttribute('_bldg', new BufferAttribute(new Float32Array(3), 1));
    g.setAttribute('_facade', new BufferAttribute(new Uint8Array(12), 4, true));
  }
  return g;
}

export async function precompileMaterials(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  materials: MaterialRegistry,
  log: Logger,
): Promise<void> {
  const t0 = performance.now();
  const holder = new Group();
  holder.name = 'precompile';
  const geos: BufferGeometry[] = [];
  const add = (g: BufferGeometry, material: Material, hlod: boolean): void => {
    const m = new Mesh(g, material);
    if (hlod) m.userData.hlodFade = createHlodFades();
    m.frustumCulled = false;
    holder.add(m);
  };
  for (const id of PRECOMPILE_IDS) {
    const base = dummyGeometry(id, false);
    geos.push(base);
    add(base, materials.get(id), false);
    // HLOD: 불투명 + 페이드(디더) 변형(ADR-0039) — hlod.mesh에 나오는 ID만.
    if (HLOD_MATERIAL_IDS.includes(id)) {
      const hl = dummyGeometry(id, true);
      geos.push(hl);
      add(hl, materials.getHlod(id), true);
      add(hl, materials.getHlod(id, true), true);
    }
    // 건물 파사드 깊이 프리패스(같은 속성 형식).
    if (id === 'facade_default') add(base, materials.prepass(), false);
  }
  scene.add(holder);
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    holder.removeFromParent();
    for (const g of geos) g.dispose();
  }
  log.info(`precompile ${holder.children.length} materials ${Math.round(performance.now() - t0)} ms`);
}
