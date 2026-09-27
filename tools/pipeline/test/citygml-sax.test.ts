import { describe, expect, it } from 'vitest';
import { parseCityGmlString } from '../src/readers/plateau/index.ts';
import type { BuildingRecord, RoadRecord } from '../src/readers/plateau/types.ts';

// 스크램블 교차로 부근의 합성 CityGML(EPSG:6697: 위도 경도 표고 순). 1e-5° ≈ 1 m.
const LAT = 35.6595;
const LON = 139.70055;
const D = 0.00001;

/** 위도·경도 오프셋(°) + 표고(m) 목록 → posList(닫힘점 포함). */
function pos(pts: [number, number, number][]): string {
  const closed = [...pts, pts[0] as [number, number, number]];
  return closed.map(([dLat, dLon, h]) => `${LAT + dLat} ${LON + dLon} ${h}`).join(' ');
}

function polygon(id: string, pts: [number, number, number][]): string {
  return `<gml:Polygon gml:id="${id}"><gml:exterior><gml:LinearRing gml:id="${id}-r"><gml:posList>${pos(pts)}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>`;
}

const ROOF: [number, number, number][] = [
  [0, 0, 10],
  [0, D, 10],
  [D, D, 10],
  [D, 0, 10],
];
const GROUND: [number, number, number][] = [
  [0, 0, 0],
  [D, 0, 0],
  [D, D, 0],
  [0, D, 0],
];
const WALL: [number, number, number][] = [
  [0, 0, 0],
  [0, D, 0],
  [0, D, 10],
  [0, 0, 10],
];

function theme(tag: string, id: string, pts: [number, number, number][]): string {
  return `<bldg:boundedBy><bldg:${tag} gml:id="${id}-s"><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember>${polygon(id, pts)}</gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:${tag}></bldg:boundedBy>`;
}

const BUILDING = `<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel>
<app:appearanceMember><app:Appearance><app:surfaceDataMember><app:ParameterizedTexture>
  <app:imageURI>x_appearance/roof.jpg</app:imageURI>
  <app:target uri="#roof1"><app:TexCoordList><app:textureCoordinates ring="#roof1-r">0 0 1 0 1 1 0 1 0 0</app:textureCoordinates></app:TexCoordList></app:target>
</app:ParameterizedTexture></app:surfaceDataMember></app:Appearance></app:appearanceMember>
<core:cityObjectMember><bldg:Building gml:id="bldg_1">
  <bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
  <bldg:measuredHeight uom="m">10.5</bldg:measuredHeight>
  <bldg:storeysAboveGround>3</bldg:storeysAboveGround>
  <bldg:storeysBelowGround>9999</bldg:storeysBelowGround>
  <bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface><gml:surfaceMember>${polygon('lod1-top', ROOF)}</gml:surfaceMember></gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid>
  ${theme('RoofSurface', 'roof1', ROOF)}${theme('WallSurface', 'wall1', WALL)}${theme('GroundSurface', 'ground1', GROUND)}
  <bldg:outerBuildingInstallation><bldg:BuildingInstallation gml:id="inst"><bldg:lod2Geometry><gml:MultiSurface><gml:surfaceMember>${polygon('inst1', WALL)}</gml:surfaceMember></gml:MultiSurface></bldg:lod2Geometry></bldg:BuildingInstallation></bldg:outerBuildingInstallation>
  <bldg:lod2Solid><gml:Solid><gml:exterior><gml:CompositeSurface><gml:surfaceMember xlink:href="#roof1"/></gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod2Solid>
  <uro:buildingIDAttribute><uro:BuildingIDAttribute><uro:buildingID>13113-bldg-1</uro:buildingID></uro:BuildingIDAttribute></uro:buildingIDAttribute>
</bldg:Building></core:cityObjectMember>
<core:cityObjectMember><bldg:Building gml:id="bldg_lod1">
  <bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface>
    <gml:surfaceMember>${polygon('a', ROOF)}</gml:surfaceMember><gml:surfaceMember>${polygon('b', GROUND)}</gml:surfaceMember><gml:surfaceMember>${polygon('c', WALL)}</gml:surfaceMember>
  </gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid>
</bldg:Building></core:cityObjectMember>
</core:CityModel>`;

function area(id: string, tag: string, code: string, lod: number): string {
  return `<tran:${tag === 'TrafficArea' ? 'trafficArea' : 'auxiliaryTrafficArea'}><tran:${tag} gml:id="${id}"><tran:function codeSpace="x">${code}</tran:function><tran:lod${lod}MultiSurface><gml:MultiSurface><gml:surfaceMember>${polygon(`${id}-p`, GROUND)}</gml:surfaceMember></gml:MultiSurface></tran:lod${lod}MultiSurface></tran:${tag}></tran:${tag === 'TrafficArea' ? 'trafficArea' : 'auxiliaryTrafficArea'}>`;
}

const ROADS = `<core:CityModel>
<core:cityObjectMember><tran:Road gml:id="road_3">
  <tran:function codeSpace="x">9020</tran:function>
  <tran:lod1MultiSurface><gml:MultiSurface><gml:surfaceMember>${polygon('r3-l1', GROUND)}</gml:surfaceMember></gml:MultiSurface></tran:lod1MultiSurface>
  ${area('ta_l2', 'TrafficArea', '1000', 2)}${area('ta_l3a', 'TrafficArea', '1020', 3)}${area('ta_l3b', 'TrafficArea', '2000', 3)}${area('aux_l3', 'AuxiliaryTrafficArea', '3000', 3)}
</tran:Road></core:cityObjectMember>
<core:cityObjectMember><tran:Road gml:id="road_1">
  <tran:function codeSpace="x">3</tran:function>
  <tran:lod1MultiSurface><gml:MultiSurface><gml:surfaceMember>${polygon('r1-l1', GROUND)}</gml:surfaceMember></gml:MultiSurface></tran:lod1MultiSurface>
</tran:Road></core:cityObjectMember>
</core:CityModel>`;

describe('citygml-sax: buildings', () => {
  const [b, lod1] = parseCityGmlString(BUILDING, 'test') as BuildingRecord[];

  it('LOD2 테마면 종류·gml:id·속성 보존, LOD1 외피는 버림', () => {
    expect(b?.gmlId).toBe('bldg_1');
    expect(b?.lod).toBe(2);
    expect(b?.surfaces.map((s) => [s.kind, s.gmlId])).toEqual([
      ['roof', 'roof1'],
      ['wall', 'wall1'],
      ['ground', 'ground1'],
      ['installation', 'inst1'],
    ]);
    expect(b).toMatchObject({ measuredHeightM: 10.5, storeys: 3, storeysBelow: null, usage: '401' });
    expect(b?.buildingId).toBe('13113-bldg-1');
  });

  it('WF 좌표: 닫힘점 제거, 표고 = y', () => {
    const roof = b?.surfaces[0]?.ringsWF[0] ?? [];
    expect(roof.length).toBe(12);
    expect(roof[1]).toBe(10);
    expect(roof[0]).toBeCloseTo(-22.29, 2); // 스크램블 WF x ≈ −22.3
  });

  it('텍스처: 링 UV를 닫힘점 제거 후 정점 수에 맞춰 연결', () => {
    expect(b?.surfaces[0]?.tex).toBe('x_appearance/roof.jpg');
    expect(b?.surfaces[0]?.uv).toEqual([[0, 0, 1, 0, 1, 1, 0, 1]]);
    expect(b?.surfaces[1]?.tex).toBeUndefined();
  });

  it('LOD1 전용 건물은 법선으로 지붕/바닥/벽 분류', () => {
    expect(lod1?.lod).toBe(1);
    expect(lod1?.surfaces.map((s) => s.kind)).toEqual(['roof', 'ground', 'wall']);
  });
});

describe('citygml-sax: roads', () => {
  const roads = parseCityGmlString(ROADS, 'test') as RoadRecord[];

  it('도로 1개 안에서 최고 LOD(3) TrafficArea만, 기능 코드 매핑', () => {
    const r3 = roads.filter((r) => r.roadId === 'road_3');
    expect(r3.map((r) => [r.id, r.lod, r.function, r.functionCode])).toEqual([
      ['ta_l3a', 3, 'carriageway', 'TrafficArea:1020'],
      ['ta_l3b', 3, 'sidewalk', 'TrafficArea:2000'],
      ['aux_l3', 3, 'island', 'AuxiliaryTrafficArea:3000'],
    ]);
  });

  it('TrafficArea가 없으면 LOD1 도로면을 carriageway로', () => {
    const r1 = roads.filter((r) => r.roadId === 'road_1');
    expect(r1.map((r) => [r.id, r.lod, r.function, r.functionCode])).toEqual([['road_1', 1, 'carriageway', 'Road:3']]);
  });
});
