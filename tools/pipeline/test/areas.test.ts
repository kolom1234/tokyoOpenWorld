// M10-T02 지명: 가나 → 로마자·한글, e-Stat 町丁 이름 분리·한자 숫자, KEN_ALL 읽기 표·이체자, shp/dbf 리더, 링 단순화, 셀 배정.
import { describe, expect, it } from 'vitest';
import { placeNamesForCell } from '../src/stages/areas/assign.ts';
import { kanaToHangul, kanaToRomaji } from '../src/stages/areas/kana.ts';
import { kanjiNumber, parseKenAll, parseNumber, placeName, splitTown } from '../src/stages/areas/names.ts';
import { simplifyRing } from '../src/stages/areas/normalize.ts';
import { readDbf, readShpPolygons } from '../src/stages/areas/shapefile.ts';

describe('kana transliteration', () => {
  const cases: [string, string, string][] = [
    ['ﾄﾞｳｹﾞﾝｻﾞｶ', 'Dogenzaka', '도겐자카'],
    ['ｼﾌﾞﾔ', 'Shibuya', '시부야'],
    ['ｼﾝｼﾞｭｸ', 'Shinjuku', '신주쿠'],
    ['ｼﾞﾝｸﾞｳﾏｴ', 'Jingumae', '진구마에'],
    ['ｾﾝﾀﾞｶﾞﾔ', 'Sendagaya', '센다가야'],
    ['ｵｵｸﾎﾞ', 'Okubo', '오쿠보'],
    ['ﾋﾛｵ', 'Hiroo', '히로오'],
    ['ﾖﾂﾔ', 'Yotsuya', '요쓰야'],
    ['ﾊｯﾄﾘ', 'Hattori', '핫토리'],
    ['ﾁｭｳｵｳ', 'Chuo', '주오'],
    ['ｶﾌﾞｷﾁｮｳ', 'Kabukicho', '가부키초'],
  ];
  it.each(cases)('%s → %s · %s', (kana, romaji, hangul) => {
    expect(kanaToRomaji(kana)).toBe(romaji);
    expect(kanaToHangul(kana)).toBe(hangul);
  });
});

describe('place names', () => {
  it('splits 丁目 in arabic or kanji digits and renders kanji numerals', () => {
    expect(splitTown('道玄坂２丁目')).toEqual({ base: '道玄坂', chome: 2 });
    expect(splitTown('西新宿八丁目')).toEqual({ base: '西新宿', chome: 8 });
    expect(splitTown('宇田川町')).toEqual({ base: '宇田川町', chome: null });
    expect(parseNumber('十二')).toBe(12);
    expect(parseNumber('二十')).toBe(20);
    expect(kanjiNumber(2)).toBe('二');
    expect(kanjiNumber(12)).toBe('十二');
    expect(kanjiNumber(21)).toBe('二十一');
  });
  it('joins KEN_ALL readings (variant ケ/ヶ, parentheses) into ja·en·ko', () => {
    const csv = [
      '13113,"151  ","1510051","ﾄｳｷｮｳﾄ","ｼﾌﾞﾔｸ","ｾﾝﾀﾞｶﾞﾔ","東京都","渋谷区","千駄ヶ谷",0,0,1,0,0,0',
      '13113,"150  ","1500043","ﾄｳｷｮｳﾄ","ｼﾌﾞﾔｸ","ﾄﾞｳｹﾞﾝｻﾞｶ(ﾂｷﾞﾉﾋﾞﾙｦﾉｿﾞｸ)","東京都","渋谷区","道玄坂（次のビルを除く）",0,0,1,0,0,0',
      '13101,"100  ","1000001","ﾄｳｷｮｳﾄ","ﾁﾖﾀﾞｸ","ﾁﾖﾀﾞ","東京都","千代田区","千代田",0,0,0,0,0,0',
    ].join('\r\n');
    const r = parseKenAll(csv, new Set(['13113']));
    expect(r.towns.size).toBe(2);
    expect(placeName('13113', '渋谷区', '千駄ケ谷四丁目', r).name).toEqual({
      ja: '渋谷区 千駄ケ谷四丁目',
      en: 'Sendagaya 4-chome, Shibuya',
      ko: '시부야구 센다가야 4초메',
    });
    expect(placeName('13113', '渋谷区', '道玄坂２丁目', r).name.en).toBe('Dogenzaka 2-chome, Shibuya');
    expect(placeName('13113', '渋谷区', '未知町', r).missing).toBe(true);
  });
});

/** 폴리곤 1개(링 1개) shp + dbf(필드 S_NAME C16). */
function syntheticShp(ring: [number, number][]): { shp: Uint8Array; dbf: Uint8Array } {
  const content = 44 + 4 + ring.length * 16;
  const shp = new Uint8Array(100 + 8 + content);
  const v = new DataView(shp.buffer);
  v.setInt32(0, 9994, false);
  v.setInt32(24, shp.length / 2, false);
  v.setInt32(100, 1, false);
  v.setInt32(104, content / 2, false);
  v.setInt32(108, 5, true);
  v.setInt32(108 + 36, 1, true);
  v.setInt32(108 + 40, ring.length, true);
  v.setInt32(108 + 44, 0, true);
  ring.forEach(([x, y], i) => {
    v.setFloat64(108 + 48 + i * 16, x, true);
    v.setFloat64(108 + 48 + i * 16 + 8, y, true);
  });
  const name = new TextEncoder().encode('S_NAME');
  const dbf = new Uint8Array(32 + 32 + 1 + 1 + 16);
  const d = new DataView(dbf.buffer);
  d.setUint32(4, 1, true);
  d.setUint16(8, 65, true);
  d.setUint16(10, 17, true);
  dbf.set(name, 32);
  dbf[32 + 11] = 'C'.charCodeAt(0);
  dbf[32 + 16] = 16;
  dbf[64] = 0x0d;
  dbf[65] = 0x20;
  dbf.set(new TextEncoder().encode('ABC'.padEnd(16, ' ')), 66);
  return { shp, dbf };
}

describe('shapefile · geometry', () => {
  it('reads polygon rings and dbf fields', () => {
    const ring: [number, number][] = [
      [139.7, 35.66],
      [139.7, 35.67],
      [139.71, 35.67],
      [139.7, 35.66],
    ];
    const { shp, dbf } = syntheticShp(ring);
    expect(readShpPolygons(shp)).toEqual([{ rings: [ring] }]);
    expect(readDbf(dbf, 'ascii')).toEqual([{ S_NAME: 'ABC' }]);
  });
  it('simplifies collinear points within tolerance, keeps corners', () => {
    const r: [number, number][] = [
      [0, 0],
      [5, 0.2],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(simplifyRing(r, 1)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });
  it('assigns rings overlapping the cell box in cell-local coordinates', () => {
    const p = {
      code: '1',
      name: { ja: 'a', en: 'a', ko: 'a' },
      rings: [
        [
          [10, 10],
          [300, 10],
          [300, 50],
        ] as [number, number][],
      ],
    };
    const far = {
      ...p,
      code: '2',
      rings: [
        [
          [1000, 1000],
          [1010, 1000],
          [1010, 1010],
        ] as [number, number][],
      ],
    };
    const out = placeNamesForCell([p, far], 256, 0, 256);
    expect(out.map((n) => n.code)).toEqual(['1']);
    expect(out[0]?.polygonLocal[0]).toEqual([-246, 10]);
  });
});
