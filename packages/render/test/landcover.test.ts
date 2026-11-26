// 원경 지면 분류(M12-T04): 토지피복 메타 → 텍스처 설정(데이터 텍스처 — 색공간 변환·뒤집기 없음, 밉맵) + 원점 유니폼.
import { Texture } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { applyLandcover, landcoverOriginU, setLandcoverOrigin } from '../src/internal/materials/landcover.ts';

describe('landcover (M12-T04)', () => {
  it('treats the weights as data: no colour space, no flip, mipmapped', () => {
    const t = new Texture();
    applyLandcover({ x0: -16384, z0: -32768, step: 16, width: 3072, height: 3072, file: 'landcover.png' }, t);
    expect(t.colorSpace).toBe('');
    expect(t.flipY).toBe(false);
    expect(t.generateMipmaps).toBe(true);
  });

  it('follows the render origin', () => {
    setLandcoverOrigin({ x: 4096, y: 0, z: -8192 });
    expect(landcoverOriginU.value.toArray()).toEqual([4096, 0, -8192]);
  });
});
