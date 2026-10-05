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
  if (hlod && id === 'facade_default') g.setAttribute('_facade', new BufferAttribute(new Uint8Array(12), 4, true));
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

/** 다음 프레임까지 양보(브라우저 = rAF — GPU 프로세스가 프레임을 내보낼 틈, 그 밖 = 매크로태스크). */
export function yieldFrame(): Promise<void> {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
    else setTimeout(r, 0);
  });
}

/**
 * 머티리얼 ID마다 묶음(기본 + HLOD 불투명·페이드 + 파사드 프리패스)으로 `compileAsync` → 진행 보고 → 한 프레임 양보.
 * 한 번에 전부 컴파일하면 GPU 프로세스가 파이프라인을 만드는 1.4–1.9 s 동안 프레임이 하나도 안 나와 로딩 화면이 멈춰 보였다(M06 실측).
 * 마지막에 장면 전체(소품 풀 priming 등)를 한 번 더 — 이미 만든 파이프라인은 캐시.
 */
export async function precompileMaterials(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  materials: MaterialRegistry,
  log: Logger,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const t0 = performance.now();
  const geos: BufferGeometry[] = [];
  let meshes = 0;
  const total = PRECOMPILE_IDS.length + 1;
  for (const [i, id] of PRECOMPILE_IDS.entries()) {
    const holder = new Group();
    holder.name = 'precompile';
    const add = (g: BufferGeometry, material: Material, hlod: boolean): void => {
      const m = new Mesh(g, material);
      if (hlod) m.userData.hlodFade = createHlodFades();
      m.frustumCulled = false;
      holder.add(m);
    };
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
    meshes += holder.children.length;
    scene.add(holder);
    try {
      await renderer.compileAsync(holder, camera, scene);
    } finally {
      holder.removeFromParent();
    }
    onProgress?.(i + 1, total);
    await yieldFrame();
  }
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const g of geos) g.dispose();
  }
  onProgress?.(total, total);
  log.info(`precompile ${meshes} materials ${Math.round(performance.now() - t0)} ms`);
}
