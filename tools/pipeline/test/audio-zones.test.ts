// 셀 audio.json 규칙(M09-T04 — ADR-0079): 보행 신호 4개+ → crossing + 유도음 발음체, 간판 → shopping, 나무 → park, 행 병합, 빈 셀 = 존 없음.
import { AUDIO_EMITTER, PROP_TYPE, type PropBatch } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { deriveAudioZones, ZONE_TILE_M } from '../src/stages/derive/audio-zones.ts';

const batch = (typeId: number, pts: [number, number, number][]): PropBatch => ({
  typeId,
  transforms: Float32Array.from(pts.flatMap(([x, z, code]) => [x, 30, z, 0, code])),
});

describe('deriveAudioZones', () => {
  it('empty cell → no zones (street default), no emitters', () => {
    const z = deriveAudioZones({ originWF: [0, 0, 0], buildings: [], batches: [], trees: [], osm: [] });
    expect(z.zones).toHaveLength(0);
    expect(z.emitters).toHaveLength(0);
  });

  it('a 4-pole signalised crossing → crossing tiles + 4 signal-tone emitters with codes', () => {
    const code = (7 << 4) | 1;
    const peds = batch(PROP_TYPE.signalPedestrian, [
      [120, 120, code],
      [140, 120, code],
      [120, 140, code + 1],
      [140, 140, code + 1],
    ]);
    const z = deriveAudioZones({ originWF: [0, 0, 0], buildings: [], batches: [peds], trees: [], osm: [] });
    expect(z.zones.some((q) => q.kind === 'crossing')).toBe(true);
    expect(z.emitters).toHaveLength(4);
    expect(z.emitters.every((e) => e.kind === AUDIO_EMITTER.signalTone && (e.code ?? 0) >> 4 === 7)).toBe(true);
    // 3개뿐인 교차로는 음향식 신호 아님.
    const small = batch(PROP_TYPE.signalPedestrian, [
      [20, 20, 0x51],
      [30, 20, 0x51],
      [20, 30, 0x52],
    ]);
    expect(
      deriveAudioZones({ originWF: [0, 0, 0], buildings: [], batches: [small], trees: [], osm: [] }).emitters,
    ).toHaveLength(0);
  });

  it('signs → shopping, dense trees → park; same-kind runs merge per row', () => {
    const signs = batch(
      PROP_TYPE.signProjecting,
      [0, 1, 2, 3].map((i) => [5 + i * 6, 5, 0] as [number, number, number]),
    );
    const trees: [number, number][] = [];
    for (let i = 0; i < 12; i++) for (const tx of [3, 4, 5]) trees.push([tx * ZONE_TILE_M + 4 + i, 200]);
    const z = deriveAudioZones({ originWF: [0, 0, 0], buildings: [], batches: [signs], trees, osm: [] });
    const shop = z.zones.filter((q) => q.kind === 'shopping');
    expect(shop).toHaveLength(1);
    expect(shop[0]?.polygonLocal).toEqual([
      [0, 0],
      [32, 0],
      [32, 32],
      [0, 32],
    ]);
    const park = z.zones.filter((q) => q.kind === 'park');
    expect(park).toHaveLength(1);
    expect(park[0]?.polygonLocal[0]).toEqual([3 * ZONE_TILE_M, 6 * ZONE_TILE_M]);
    expect(park[0]?.polygonLocal[1]).toEqual([6 * ZONE_TILE_M, 6 * ZONE_TILE_M]);
  });
});
