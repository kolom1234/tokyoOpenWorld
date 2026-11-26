// 선컴파일 더미 = 실제 셀 속성 형식(M12): three 파이프라인 캐시 키는 배열 타입을 보지 않는데 정점 버퍼 형식은 파이프라인에 고정된다 →
// 더미가 u16 위치였을 때 실제 셀(f32 위치, DecodedMesh 규약)이 더미 파이프라인으로 그려져 HLOD 지형이 사라졌다.
// 기대값 = 실제 world 빌드(20261018-82db354-aa09c5ca) 셀을 buildGeometry로 변환한 속성 서명(2026-11-26 실측).
import type { BufferGeometry } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { dummyGeometry } from '../src/internal/materials/precompile.ts';
import { HLOD_MATERIAL_IDS, PRECOMPILE_IDS } from '../src/internal/materials/registry.ts';

/** 이름:배열타입x성분[n] (이름순) — 파이프라인 정점 형식을 정하는 값 전부. */
function signature(g: BufferGeometry): string {
  return Object.keys(g.attributes)
    .sort()
    .map((k) => {
      const a = g.getAttribute(k);
      return `${k}:${a.array.constructor.name.replace('Array', '')}x${a.itemSize}${a.normalized ? 'n' : ''}`;
    })
    .join(' ');
}

const REAL_L0: Readonly<Record<string, string>> = {
  terrain_ground: '_surf:Float32x1 normal:Int8x3n position:Float32x3',
  facade_default: '_bldg:Float32x1 _facade:Uint8x4n normal:Int8x3n position:Float32x3 uv:Float32x2 uv1:Float32x2',
  road_marking: '_paint:Float32x1 normal:Int8x3n position:Float32x3',
  power_wire: '_off:Int8x3n normal:Int8x3n position:Float32x3',
  landmark: '_lmat:Float32x1 normal:Int8x3n position:Float32x3 uv:Float32x2',
};
const REAL_HLOD: Readonly<Record<string, string>> = {
  terrain_ground: '_child:Float32x1 _surf:Float32x1 normal:Int8x3n position:Float32x3',
  facade_default: '_child:Float32x1 _facade:Uint8x4n normal:Int8x3n position:Float32x3 uv:Float32x2',
};

describe('precompile dummy geometry matches real cells', () => {
  it('uses the decoded attribute formats for every L0 material (float32 positions)', () => {
    expect(Object.keys(REAL_L0).sort()).toEqual([...PRECOMPILE_IDS].sort());
    for (const id of PRECOMPILE_IDS) {
      const g = dummyGeometry(id, false);
      expect(signature(g), id).toBe(REAL_L0[id]);
      expect(g.index, id).not.toBeNull();
    }
  });

  it('uses the decoded attribute formats for every HLOD material', () => {
    expect(Object.keys(REAL_HLOD).sort()).toEqual([...HLOD_MATERIAL_IDS].sort());
    for (const id of HLOD_MATERIAL_IDS) expect(signature(dummyGeometry(id, true)), id).toBe(REAL_HLOD[id]);
  });
});
