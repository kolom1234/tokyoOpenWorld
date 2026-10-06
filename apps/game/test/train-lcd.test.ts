// M07-T05 차내 안내 화면 문구: 다음 역·정차·도착까지 분·문 쪽·경계역 안내 — 일·영·한(자체 문구), 노선색 띠.
import type { RailNetwork, TimetableFile } from '@sanpo/tile-format';
import type { TrainHud } from '@sanpo/traversal';
import { describe, expect, it } from 'vitest';
import { lcdText } from '../src/train-lcd.ts';

const network = {
  lines: [{ id: 'yamanote', name: { ja: '山手線', en: 'Yamanote Line', ko: '야마노테선' }, color: '#9acd32' }],
  stations: [
    { id: 'harajuku', name: { ja: '原宿', en: 'Harajuku', ko: '하라주쿠' } },
    { id: 'shinjuku', name: { ja: '新宿', en: 'Shinjuku', ko: '신주쿠' } },
  ],
} as unknown as RailNetwork;
const tt = [
  { routes: [{ id: 'yamanote', name: { ja: '山手線', en: 'Yamanote Line', ko: '야마노테선' }, color: '#9acd32' }] },
] as unknown as TimetableFile[];
const hud: TrainHud = {
  tripId: 't',
  lineId: 'yamanote',
  routeId: 'yamanote',
  heading: 'outer',
  view: 'frontView',
  car: 0,
  stoppedAtStationId: null,
  nextStationId: 'harajuku',
  doorSide: -1,
  arrivalInS: 95,
  notice: null,
  skipping: false,
};

describe('train LCD', () => {
  it('shows the next station, minutes and door side in three languages', () => {
    const ja = lcdText(hud, { network, timetables: tt }, 'ja');
    expect(ja.line).toBe('山手線 外回り');
    expect(ja.main).toBe('次は 原宿');
    expect(ja.sub).toBe('あと約 2 分 · 左側のドアが開きます');
    expect(ja.color).toBe('#9acd32');
    expect(lcdText(hud, { network, timetables: tt }, 'en').main).toBe('Next: Harajuku');
    expect(lcdText(hud, { network, timetables: tt }, 'ko').main).toBe('다음 역 하라주쿠');
    expect(lcdText({ ...hud, arrivalInS: 12 }, { network, timetables: tt }, 'ko').sub).toBe(
      '곧 도착 · 왼쪽 문이 열립니다',
    );
  });

  it('announces the MVP edge alighting', () => {
    const h = { ...hud, stoppedAtStationId: 'shinjuku', nextStationId: null, notice: 'mvpEdge' as const };
    expect(lcdText(h, { network, timetables: tt }, 'ko').main).toBe('이 앞은 미개방 구역입니다. 신주쿠에서 내립니다.');
    expect(lcdText(h, undefined, 'en').main).toContain('shinjuku');
  });
});
