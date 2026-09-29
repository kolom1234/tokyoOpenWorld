// 실내 큐브맵 생성(M03-T05): 면 좌표 표 ↔ 셰이더 역변환 일치, 방별 결정론·서로 다름, PNG 인코더 왕복.
import { describe, expect, it } from 'vitest';
import { decodePng, encodePngRgb } from '../src/lib/png.ts';
import { INTERIOR_ROOMS } from '../src/stages/materials/interior-rooms.ts';
import { faceDir, INTERIOR_FACES, renderFace } from '../src/stages/materials/interiors.ts';

/** render materials/facade/interior.ts cubeFace()와 같은 역변환(JS 사본). */
function cubeFace(h: readonly number[]): { face: number; s: number; t: number } {
  const [x, y, z] = h as [number, number, number];
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
  if (ax >= ay && ax >= az) return { face: x > 0 ? 0 : 1, s: (x > 0 ? -z : z) / ax, t: y / ax };
  if (ay >= az) return { face: y > 0 ? 2 : 3, s: x / ay, t: (y > 0 ? -z : z) / ay };
  return { face: z > 0 ? 4 : 5, s: (z > 0 ? x : -x) / az, t: y / az };
}

describe('interior cubemaps', () => {
  it('face table round-trips through the shader inverse', () => {
    for (let f = 0; f < INTERIOR_FACES; f++) {
      for (const [s, t] of [
        [0.3, -0.7],
        [-0.9, 0.2],
        [0.5, 0.5],
      ] as const) {
        const r = cubeFace(faceDir(f, s, t));
        expect(r.face).toBe(f);
        expect(r.s).toBeCloseTo(s, 10);
        expect(r.t).toBeCloseTo(t, 10);
      }
    }
  });

  it('renders deterministic, distinct rooms (8 × 6 faces)', () => {
    expect(INTERIOR_ROOMS).toHaveLength(8);
    const a = renderFace(INTERIOR_ROOMS[0] as (typeof INTERIOR_ROOMS)[number], 4, 32);
    expect(renderFace(INTERIOR_ROOMS[0] as (typeof INTERIOR_ROOMS)[number], 4, 32)).toEqual(a);
    const seen = new Set(INTERIOR_ROOMS.map((r) => Buffer.from(renderFace(r, 4, 32)).toString('base64')));
    expect(seen.size).toBe(8);
    const ceiling = renderFace(INTERIOR_ROOMS[0] as (typeof INTERIOR_ROOMS)[number], 2, 32);
    expect(Math.max(...ceiling)).toBe(255); // 켜진 조명판 = 포화
  });

  it('encodes RGB PNG that decodes back', () => {
    const rgb = Uint8Array.from({ length: 5 * 3 * 3 }, (_, i) => (i * 37) & 0xff);
    const png = decodePng(encodePngRgb(5, 3, rgb));
    expect([png.width, png.height, png.channels]).toEqual([5, 3, 3]);
    expect(Array.from(png.data)).toEqual(Array.from(rgb));
  });
});
