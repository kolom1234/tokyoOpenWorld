// B안 CityGML 스트리밍 파서의 상태기계: SAX 이벤트 → 건물·도로 레코드. 드라이버는 citygml-sax.ts. see docs/adr/0007-plateau-reader.md
// 요소 이름은 PLATEAU 표준 접두사(bldg/tran/gml/app/uro) 기준(네임스페이스 해석 생략 — 속도 우선, ADR-0007 참조).
import { type AreaCtx, type BuildingCtx, finishBuilding, finishRoad, type RoadCtx } from './citygml-assemble.ts';
import { knownNumber, type TrafficAreaType } from './codes.ts';
import { classifyByNormal, latLonHToWF, parsePosList } from './geometry.ts';
import type { NormalizedFeature, SurfaceKind, SurfaceRecord } from './types.ts';

const UV_DIGITS = 6;
const THEME_KIND: Readonly<Record<string, SurfaceKind>> = {
  'bldg:RoofSurface': 'roof',
  'bldg:WallSurface': 'wall',
  'bldg:GroundSurface': 'ground',
  'bldg:ClosureSurface': 'closure',
  'bldg:OuterFloorSurface': 'roof', // 위를 향한 외부 바닥(발코니 바닥 등)
  'bldg:OuterCeilingSurface': 'ground', // 아래를 향한 외부 천장(처마 밑 등)
};
/** 캡처할 기하 속성: lod1Solid(LOD1 외피), lodN MultiSurface/Geometry. lod2Solid·lod3Solid는 xlink 참조뿐이라 제외. */
const GEOM_RE = /^(?:bldg|tran):lod([1-4])(Solid|MultiSurface|Geometry)$/;
const TEXT_ELEMENTS = new Set([
  'gml:posList',
  'app:imageURI',
  'app:textureCoordinates',
  'bldg:measuredHeight',
  'bldg:storeysAboveGround',
  'bldg:storeysBelowGround',
  'bldg:usage',
  'uro:buildingID',
  'tran:function',
]);

interface Tex {
  img: number;
  uv: number[];
}
interface Poly {
  id: string | null;
  rings: number[][];
  ringIds: (string | null)[];
}
type Attrs = Readonly<Record<string, string>>;

export interface SaxStats {
  polygons: number;
  texturedPolygons: number;
  skippedRings: number;
}

/** SAX 이벤트를 받아 최상위 Building/Road가 닫힐 때마다 `emit`한다. appearance는 문서 앞·뒤 어디든 먼저 나온 것만 연결. */
export class CityGmlState {
  readonly stats: SaxStats = { polygons: 0, texturedPolygons: 0, skippedRings: 0 };
  private readonly images: string[] = [];
  private readonly imageIndex = new Map<string, number>();
  private readonly ringTex = new Map<string, Tex>();
  private buf: string[] | null = null;
  private texImage = -1;
  private texRing: string | null = null;
  private bldg: BuildingCtx | null = null;
  private road: RoadCtx | null = null;
  private area: AreaCtx | null = null;
  private themeKind: SurfaceKind | null = null;
  private themeId: string | null = null;
  private installDepth = 0;
  private geom: { name: string; lod: number } | null = null;
  private poly: Poly | null = null;
  private ringId: string | null = null;
  private inInterior = false;

  private readonly sourceId: string;
  private readonly emit: (f: NormalizedFeature) => void;

  constructor(sourceId: string, emit: (f: NormalizedFeature) => void) {
    this.sourceId = sourceId;
    this.emit = emit;
  }

  open(name: string, attrs: Attrs): void {
    if (TEXT_ELEMENTS.has(name)) this.buf = [];
    if (name.startsWith('gml:')) this.openGml(name, attrs);
    else if (name.startsWith('app:')) this.openApp(name, attrs);
    else this.openFeature(name, attrs);
  }

  text(t: string): void {
    if (this.buf !== null) this.buf.push(t);
  }

  close(name: string): void {
    if (this.buf !== null && TEXT_ELEMENTS.has(name)) {
      const text = this.buf.join('');
      this.buf = null;
      this.onText(name, text);
    }
    this.closeStructural(name);
  }

  private openGml(name: string, attrs: Attrs): void {
    const id = attrs['gml:id'] ?? null;
    if (name === 'gml:Polygon') this.poly = { id, rings: [], ringIds: [] };
    else if (name === 'gml:LinearRing') this.ringId = id;
    else if (name === 'gml:interior') this.inInterior = true;
    else if (name === 'gml:exterior') this.inInterior = false;
  }

  private openApp(name: string, attrs: Attrs): void {
    if (name === 'app:ParameterizedTexture') this.texImage = -1;
    else if (name === 'app:textureCoordinates') this.texRing = stripHash(attrs.ring);
  }

  private openFeature(name: string, attrs: Attrs): void {
    const id = attrs['gml:id'] ?? '';
    const theme = THEME_KIND[name];
    if (name === 'bldg:Building' && !this.bldg) this.bldg = newBuilding(id);
    else if (name === 'bldg:BuildingInstallation') this.installDepth++;
    else if (theme && this.bldg) {
      this.themeKind = theme;
      this.themeId = id || null;
    } else if (name === 'tran:Road' && !this.road) {
      this.road = { area: newArea(id, 'Road'), areas: [] };
    } else if ((name === 'tran:TrafficArea' || name === 'tran:AuxiliaryTrafficArea') && this.road) {
      this.area = newArea(id, name.slice(5) as TrafficAreaType);
      this.road.areas.push(this.area);
    } else if (!this.geom && (this.bldg || this.road)) {
      const m = GEOM_RE.exec(name);
      if (m && !(m[2] === 'Solid' && m[1] !== '1')) this.geom = { name, lod: Number(m[1]) };
    }
  }

  private closeStructural(name: string): void {
    if (name === 'gml:Polygon' && this.poly) {
      this.onPolygonEnd(this.poly);
      this.poly = null;
    } else if (this.geom && name === this.geom.name) this.geom = null;
    else if (THEME_KIND[name]) this.themeKind = this.themeId = null;
    else if (name === 'bldg:BuildingInstallation') this.installDepth--;
    else if (name === 'tran:TrafficArea' || name === 'tran:AuxiliaryTrafficArea') this.area = null;
    else if (name === 'bldg:Building' && this.bldg) {
      // BuildingPart는 별도 요소명 → 여기 도달 = 최상위 Building 종료.
      const b = finishBuilding(this.bldg, this.sourceId);
      if (b) this.emit(b);
      this.bldg = null;
    } else if (name === 'tran:Road' && this.road) {
      for (const r of finishRoad(this.road, this.sourceId)) this.emit(r);
      this.road = null;
    }
  }

  private onText(name: string, text: string): void {
    if (name === 'gml:posList') this.onPosList(text);
    else if (name === 'app:imageURI') this.texImage = this.imageIdOf(text.trim());
    else if (name === 'app:textureCoordinates') {
      if (this.texRing && this.texImage >= 0) {
        this.ringTex.set(this.texRing, { img: this.texImage, uv: parseUv(text) });
      }
    } else if (name === 'tran:function') {
      const target = this.area ?? this.road?.area;
      if (target) target.code = text.trim();
    } else if (this.bldg) onBuildingAttr(this.bldg, name, text);
  }

  private onPosList(text: string): void {
    const p = this.poly;
    if (!p) return;
    const values = parsePosList(text);
    const ring = values ? latLonHToWF(values) : [];
    if (ring.length === 0) {
      this.stats.skippedRings++;
      return;
    }
    // 외곽 링을 항상 0번에 둔다(interior가 먼저 나오는 비정상 순서 대비).
    if (this.inInterior || p.rings.length === 0) {
      p.rings.push(ring);
      p.ringIds.push(this.ringId);
    } else {
      p.rings.unshift(ring);
      p.ringIds.unshift(this.ringId);
    }
  }

  private onPolygonEnd(p: Poly): void {
    this.stats.polygons++;
    if (!this.geom || p.rings.length === 0) return;
    if (this.bldg) {
      const kind = this.installDepth > 0 ? 'installation' : this.themeKind;
      pushTo(this.bldg.byLod, this.geom.lod, this.toSurface(p, kind));
    } else if (this.road) {
      pushTo((this.area ?? this.road.area).byLod, this.geom.lod, p.rings);
    }
  }

  private toSurface(p: Poly, kind: SurfaceKind | null): SurfaceRecord {
    const s: SurfaceRecord = { kind: kind ?? classifyByNormal(p.rings), ringsWF: p.rings };
    const id = p.id ?? this.themeId;
    if (id !== null) s.gmlId = id;
    const tex = this.texOf(p);
    if (tex) {
      s.tex = tex.tex;
      s.uv = tex.uv;
      this.stats.texturedPolygons++;
    }
    return s;
  }

  /** 모든 링이 같은 이미지의 UV를 가질 때만 연결. UV 개수는 닫힘점 제거 후 정점 수와 맞춘다. */
  private texOf(p: Poly): { tex: string; uv: number[][] } | null {
    const uv: number[][] = [];
    let img = -1;
    for (let i = 0; i < p.rings.length; i++) {
      const id = p.ringIds[i];
      const t = id ? this.ringTex.get(id) : undefined;
      const verts = (p.rings[i] as number[]).length / 3;
      if (!t || (img >= 0 && t.img !== img)) return null;
      img = t.img;
      const ring = t.uv.length / 2 === verts + 1 ? t.uv.slice(0, verts * 2) : t.uv;
      if (ring.length !== verts * 2) return null;
      uv.push(ring);
    }
    const tex = this.images[img];
    return tex === undefined ? null : { tex, uv };
  }

  private imageIdOf(uri: string): number {
    let id = this.imageIndex.get(uri);
    if (id === undefined) {
      id = this.images.length;
      this.images.push(uri);
      this.imageIndex.set(uri, id);
    }
    return id;
  }
}

function newBuilding(id: string): BuildingCtx {
  return {
    gmlId: id,
    buildingId: null,
    measuredHeightM: null,
    storeys: null,
    storeysBelow: null,
    usage: null,
    byLod: new Map(),
  };
}

function newArea(id: string, type: TrafficAreaType): AreaCtx {
  return { gmlId: id, type, code: null, byLod: new Map() };
}

/** 최상위 Building 값 우선(BuildingPart 값은 비어 있을 때만 채움). */
function onBuildingAttr(b: BuildingCtx, name: string, text: string): void {
  if (name === 'bldg:measuredHeight') b.measuredHeightM ??= knownNumber(text);
  else if (name === 'bldg:storeysAboveGround') b.storeys ??= knownNumber(text);
  else if (name === 'bldg:storeysBelowGround') b.storeysBelow ??= knownNumber(text);
  else if (name === 'bldg:usage') b.usage ??= text.trim() || null;
  else if (name === 'uro:buildingID') b.buildingId ??= text.trim() || null;
}

function pushTo<T>(m: Map<number, T[]>, k: number, v: T): void {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

function stripHash(v: string | undefined): string | null {
  if (!v) return null;
  return v.startsWith('#') ? v.slice(1) : v;
}

function parseUv(text: string): number[] {
  const values = parsePosList(text) ?? [];
  return values.map((v) => Number(v.toFixed(UV_DIGITS)));
}
