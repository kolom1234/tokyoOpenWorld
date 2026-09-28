// HLOD 자식 전환(M02-T05): 숨김 = 0.3 s 페이드, 보임 = 즉시, 부모 도착 전 상태 기억, 페이드 벡터 공유, `_CHILD` → float 속성.
// see docs/06-world-streaming.md §5, ADR-0024
import { packCellKey } from '@sanpo/core';
import { Vector4 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../src/internal/scene/cell-node.ts';
import { createHlodSwitch, HLOD_FADE_S } from '../src/internal/scene/hlod-switch.ts';

const P = packCellKey(1, 0, 0);
const vecs = () => [new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1)];

describe('hlod switch', () => {
  it('hides a child with a 0.3 s fade and shows it again instantly', () => {
    const sw = createHlodSwitch();
    const v = vecs();
    sw.attach(P, v);
    sw.setChildVisible(P, 5, false);
    expect(v[1]?.y).toBe(1); // 페이드 시작 전
    expect(sw.update(HLOD_FADE_S / 2)).toBe(1);
    expect(v[1]?.y).toBeCloseTo(0.5, 5);
    expect(sw.update(HLOD_FADE_S)).toBe(0);
    expect(v[1]?.y).toBe(0);
    expect(sw.hiddenOf(P)).toBe(1);
    sw.setChildVisible(P, 5, true); // 자식 해제 직전 → 즉시 보임(구멍 없음)
    expect(v[1]?.y).toBe(1);
    expect(sw.hiddenOf(P)).toBe(0);
  });

  it('remembers hidden children for a parent that arrives later (starts hidden, no fade-in)', () => {
    const sw = createHlodSwitch();
    sw.setChildVisible(P, 0, false);
    sw.setChildVisible(P, 15, false);
    const v = vecs();
    sw.attach(P, v);
    expect([v[0]?.x, v[3]?.w, v[0]?.y]).toEqual([0, 0, 1]);
    expect(sw.update(0.016)).toBe(0);
  });

  it('forgets fully visible detached parents (no leak) and rejects bad child indices', () => {
    const sw = createHlodSwitch();
    sw.attach(P, vecs());
    sw.setChildVisible(P, 3, false);
    sw.detach(P);
    expect(sw.size).toBe(1); // 숨김 상태는 부모 재도착을 위해 보관
    sw.setChildVisible(P, 3, true);
    expect(sw.size).toBe(0);
    expect(() => sw.setChildVisible(P, 16, false)).toThrow();
  });
});

describe('hlod geometry', () => {
  it('converts _CHILD (u8) to a float32 `_child` attribute (WebGPU has no 1-component u8 format)', () => {
    const g = buildGeometry({
      materialId: 'terrain_ground',
      attributes: {
        POSITION: { array: new Float32Array(9), itemSize: 3, normalized: false },
        _CHILD: { array: new Uint8Array([0, 7, 15]), itemSize: 1, normalized: false },
      },
      index: new Uint16Array([0, 1, 2]),
      boundsLocal: { min: [0, 0, 0], max: [1, 1, 1] },
    });
    const a = g.getAttribute('_child');
    expect(a.array).toBeInstanceOf(Float32Array);
    expect([...a.array]).toEqual([0, 7, 15]);
    expect(g.getAttribute('_CHILD')).toBeUndefined();
  });
});
