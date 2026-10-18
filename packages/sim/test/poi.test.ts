// M10-T04 POI 발견 판정: 반경 안 연속 2 s(나가면 초기화), freecam·idle 제외, 한 번만, 세이브 복원.
import { describe, expect, it } from 'vitest';
import { createPoiService } from '../src/index.ts';

const pois = [
  { id: 'a', posWF: { x: 0, y: 0, z: 0 }, radiusM: 30 },
  { id: 'b', posWF: { x: 500, y: 0, z: 0 }, radiusM: 50 },
];

describe('poi service', () => {
  it('discovers after 2 s inside, resets when leaving, once only', () => {
    const s = createPoiService(pois);
    const at = { x: 10, y: 0, z: 0 };
    expect(s.update(at, 'walk', 1.5)).toEqual([]);
    expect(s.update({ x: 100, y: 0, z: 0 }, 'walk', 0.1)).toEqual([]);
    expect(s.update(at, 'walk', 1.5)).toEqual([]);
    expect(s.update(at, 'walk', 0.6)).toEqual(['a']);
    expect(s.update(at, 'walk', 5)).toEqual([]);
    expect([...s.discovered]).toEqual(['a']);
  });
  it('ignores freecam, counts vehicles and trains', () => {
    const s = createPoiService(pois);
    const at = { x: 480, y: 0, z: 10 };
    expect(s.update(at, 'freecam', 5)).toEqual([]);
    expect(s.update(at, 'drive', 2)).toEqual(['b']);
  });
  it('restores saved ids and drops unknown ones', () => {
    const s = createPoiService(pois);
    s.restore(['b', 'zzz']);
    expect([...s.discovered]).toEqual(['b']);
    expect(s.update({ x: 500, y: 0, z: 0 }, 'walk', 3)).toEqual([]);
  });
});
