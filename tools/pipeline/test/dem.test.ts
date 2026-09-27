import { describe, expect, it } from 'vitest';
import { mergeWithFallback, targetExtentOf, valueStats } from '../src/lib/raster.ts';
import { DEM_NODATA, meshOfMember, parseFgdDem } from '../src/readers/dem.ts';
import { gridOfBounds } from '../src/stages/normalize-terrain.ts';

/** 3×2 격자, startPoint (1,0) → 첫 칸 결측, 마지막 칸은 생략(결측). */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Dataset><DEM gml:id="DEM001"><type>1mメッシュ（標高）</type><mesh>53393596</mesh>
<coverage><gml:boundedBy><gml:Envelope srsName="fguuid:jgd2024.bl">
<gml:lowerCorner>35.658333333 139.7</gml:lowerCorner><gml:upperCorner>35.666666667 139.7125</gml:upperCorner>
</gml:Envelope></gml:boundedBy>
<gml:gridDomain><gml:Grid><gml:limits><gml:GridEnvelope><gml:low>0 0</gml:low><gml:high>2 1</gml:high></gml:GridEnvelope></gml:limits></gml:Grid></gml:gridDomain>
<gml:rangeSet><gml:DataBlock><gml:tupleList>
地表面,15.20
内水面,3.05
データなし,-9999.
海水面,-9999.
</gml:tupleList></gml:DataBlock></gml:rangeSet>
<gml:coverageFunction><gml:GridFunction><gml:sequenceRule order="+x-y">Linear</gml:sequenceRule><gml:startPoint>1 0</gml:startPoint></gml:GridFunction></gml:coverageFunction>
</coverage></DEM></Dataset>`;

describe('parseFgdDem', () => {
  const t = parseFgdDem(XML);

  it('헤더: 메시·격자 크기·외곽·좌표계 표기', () => {
    expect(t).toMatchObject({ mesh: '53393596', cols: 3, rows: 2, south: 35.658333333, west: 139.7, east: 139.7125 });
    expect(t.srsName).toBe('fguuid:jgd2024.bl');
  });

  it('startPoint 이전·생략 꼬리·データなし·海水面 = 결측, 内水面은 값 유지', () => {
    expect([...t.values]).toEqual([
      DEM_NODATA,
      15.199999809265137,
      3.049999952316284,
      DEM_NODATA,
      DEM_NODATA,
      DEM_NODATA,
    ]);
    expect(t.pointTypes).toEqual({ 地表面: 1, 内水面: 1, データなし: 1, 海水面: 1 });
  });

  it('지원하지 않는 정렬 규칙은 거부', () => {
    expect(() => parseFgdDem(XML.replace('+x-y', '+y+x'))).toThrow(/sequenceRule/);
  });
});

describe('meshOfMember', () => {
  it('zip 멤버 이름 → 3차 메시', () => {
    expect(meshOfMember('FG-GML-5339-35-96-DEM1A-20250822.xml')).toBe('53393596');
    expect(meshOfMember('readme.txt')).toBeNull();
  });
});

describe('terrain grid', () => {
  it('WF 경계 → 픽셀 중심 = 정수 PRJ(양끝 정점 포함), 원점 WF(0,0) = PRJ(E0,N0)', () => {
    const g = gridOfBounds({ minX: -256, minZ: -256, maxX: 256, maxZ: 256 });
    expect(g).toEqual({ epsg: 'EPSG:6677', eMin: -12256, nMax: -37504, width: 513, height: 513 });
    expect(targetExtentOf(g)).toEqual([-12256.5, -38016.5, -11743.5, -37503.5]);
  });

  it('1A 결측만 5A로 채우고 둘 다 결측이면 남긴다', () => {
    const n = DEM_NODATA;
    const { values, stats } = mergeWithFallback(new Float32Array([1, n, n, 4]), new Float32Array([9, 2, n, 9]), n);
    expect([...values]).toEqual([1, 2, n, 4]);
    expect(stats).toEqual({ pixels: 4, primaryMissing: 2, filledBySecondary: 1, remaining: 1 });
    expect(valueStats(values, n)).toEqual({ count: 3, nodata: 1, min: 1, max: 4, mean: 2.333 });
  });
});
