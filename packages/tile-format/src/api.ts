// @sanpo/tile-format 공개 계약: 포맷 상수·섹션 레지스트리·헤더/바이너리 모델·셀 데이터 모델. see docs/05-tile-format.md, docs/modules/tile-format.md
import type { CellId, CellKey, CellLevel, Vec3d } from '@sanpo/core';

// ── 포맷 상수 (05 §3, §5–7) ──

/** TKC 매직 "TKC1"을 u32 LE로 읽은 값. */
export const TKC_MAGIC = 0x3143_4b54;
/** 런타임이 지원하는 유일한 TKC formatVersion (05 §8). */
export const FORMAT_VERSION = 1;
/** 섹션 시작 정렬(바이트). 헤더 JSON 뒤·섹션 사이는 0 패딩. */
export const TKC_ALIGN = 16;
/** TKC 고정 프리앰블 길이(magic·version·flags·headerByteLength·reserved). */
export const TKC_PREAMBLE_BYTES = 16;
/** cells.idx 매직 "TKCI"(u32 LE). */
export const CELLS_INDEX_MAGIC = 0x4943_4b54;
/** JCOL 매직 "JCOL"(u32 LE)·버전. */
export const JCOL_MAGIC = 0x4c4f_434a;
export const JCOL_VERSION = 1;
/** lanes.bin 매직 "LANE"(u32 LE)·버전. */
export const LANES_MAGIC = 0x454e_414c;
export const LANES_VERSION = 1;
/** `signalGroup` 값 "신호 없음". */
export const LANE_NO_SIGNAL = 0xffff;
/** terrain.height 기본값: 257² 격자(1 m 간격, 셀 경계 공유), 양자화 단위 0.01 m. */
export const HEIGHTFIELD_SIZE = 257;
export const HEIGHTFIELD_STEP_M = 0.01;
/**
 * terrain.height 공통 기준 높이(`minH`, m). 모든 셀이 같은 기준·스텝으로 양자화해야 이웃 셀 경계 샘플의 u16이
 * 비트 단위로 같다(ADR-0018). 표현 범위 = −100 … +555.35 m(65535 step).
 */
export const HEIGHTFIELD_BASE_M = -100;

// ── 섹션 레지스트리 (05 §4 표와 1:1. 새 섹션은 표와 여기 동시 등록) ──

export type SectionCodec = 'glb' | 'bin' | 'bin+gzip' | 'json+gzip';
export interface SectionSpec {
  /** 섹션 바이트의 인코딩. writeTkc는 데이터를 변환하지 않고 이 값을 헤더에 기록한다. */
  readonly codec: SectionCodec;
  /** 이 섹션을 둘 수 있는 셀 레벨. */
  readonly levels: readonly CellLevel[];
}
export const SECTION_REGISTRY = {
  'audio.json': { codec: 'json+gzip', levels: [0] },
  'buildings.mesh': { codec: 'glb', levels: [0, 1] },
  'collision.bin': { codec: 'bin+gzip', levels: [0] },
  'decals.mesh': { codec: 'glb', levels: [0] },
  'hlod.mesh': { codec: 'glb', levels: [1, 2, 3] },
  'lanes.bin': { codec: 'bin+gzip', levels: [0] },
  'lights.bin': { codec: 'bin+gzip', levels: [0] },
  'meta.json': { codec: 'json+gzip', levels: [0] },
  'nav.bin': { codec: 'bin', levels: [0] },
  'overrides.mesh': { codec: 'glb', levels: [0] },
  'props.inst': { codec: 'bin+gzip', levels: [0] },
  'roads.mesh': { codec: 'glb', levels: [0] },
  'terrain.height': { codec: 'bin+gzip', levels: [0] },
  'terrain.mesh': { codec: 'glb', levels: [0, 1, 2, 3] },
  'trees.inst': { codec: 'bin+gzip', levels: [0, 1] },
} as const satisfies Record<string, SectionSpec>;
export type SectionType = keyof typeof SECTION_REGISTRY;

// ── 오류 ──

/** 손상·비호환 입력(복구 가능) 분류. 프로그래밍 오류(잘못된 writer 입력)는 throw. */
export const TkcErrorCode = {
  /** 버퍼가 구조가 요구하는 길이보다 짧다. */
  Truncated: 'truncated',
  Magic: 'magic',
  /** formatVersion(또는 JCOL/lanes version) 불일치. */
  Version: 'version',
  /** v1에서 정의되지 않았거나 지원하지 않는 flags 비트(헤더 gzip 포함). */
  Flags: 'flags',
  /** 헤더 JSON 디코드·구조 오류. */
  Header: 'header',
  /** 오프셋/길이가 파일 범위 밖이거나 헤더·다른 섹션과 겹침. */
  Range: 'range',
  /** 섹션 오프셋이 16바이트 정렬이 아님. */
  Align: 'align',
  /** 내용 불일치(참조 범위 밖 인덱스, 정렬 위반, 비유한 실수, 해시 불일치, gzip 손상 등). */
  Corrupt: 'corrupt',
} as const;
export type TkcErrorCode = (typeof TkcErrorCode)[keyof typeof TkcErrorCode];
export interface TkcError {
  code: TkcErrorCode;
  message: string;
}

// ── TKC 헤더 (schemas/cell-header.schema.json) ──

export type Vec3Tuple = [number, number, number];
export interface SectionEntry {
  /** 등록 타입 또는 이 런타임이 모르는 미래 타입(읽기 시 무시). */
  type: string;
  /** 파일 시작 기준 절대 오프셋, 16의 배수, ≥ 헤더 끝. */
  offset: number;
  length: number;
  codec: SectionCodec;
  /** 데이터 출처 ID(`data/sources.lock.json` 키). 정렬·중복 제거됨, ≥1개. */
  sources: string[];
  /** `"xxh64:" + 16자리 소문자 hex` — 저장된(압축 후) 섹션 바이트의 XXH64(seed 0). */
  hash: string;
}
export interface CellStats {
  tris: number;
  colliderTris: number;
  instances: number;
}
export interface CellHeader {
  cell: { level: CellLevel; ix: number; iz: number };
  buildId: string;
  /** `(ix*size, 0, iz*size)` WF 미터. 섹션 내 위치는 셀 로컬(WF − originWF). */
  originWF: Vec3Tuple;
  /** 경계를 넘는 건물을 포함한 확장 AABB(WF 미터). */
  aabbWF: { min: Vec3Tuple; max: Vec3Tuple };
  sections: SectionEntry[];
  materials: string[];
  stats: CellStats;
}
export type CellHeaderInput = Omit<CellHeader, 'sections'>;
export interface TkcSectionInput {
  type: SectionType;
  sources: readonly string[];
  /** 이미 코덱(레지스트리)대로 인코딩된 바이트. writeTkc는 압축하지 않는다. */
  data: Uint8Array;
}
export interface TkcReader {
  /** 파싱된 헤더. `sections`에는 미지 타입 항목도 그대로 포함된다. */
  readonly header: CellHeader;
  /** 등록 섹션의 원본 버퍼 view(복사 없음). 없거나 미지 타입이면 undefined. */
  section(type: SectionType): Uint8Array | undefined;
  entry(type: SectionType): SectionEntry | undefined;
}

// ── cells.idx (05 §5) ──

/** cells.idx 레코드 flags 비트. */
export const CELL_FLAG = { override: 1, rail: 2 } as const;
export interface CellsIndexEntry {
  level: CellLevel;
  ix: number;
  iz: number;
  flags: number;
  /** .tkc 파일 바이트 수. */
  byteLength: number;
  /** `tkcHash32(파일 바이트)` = XXH64(seed 0)의 하위 32비트. */
  hash32: number;
}
export interface CellsIndexRecord {
  flags: number;
  byteLength: number;
  hash32: number;
}
/** 삽입 순서 = 파일 순서(level, iz, ix 오름차순). */
export type CellsIndex = ReadonlyMap<CellKey, CellsIndexRecord>;

// ── JCOL (05 §6) ──

export const JCOL_MATERIAL = {
  concrete: 0,
  asphalt: 1,
  metal: 2,
  glass: 3,
  wood: 4,
  grass: 5,
  soil: 6,
  tile: 7,
} as const;
export const JCOL_FLAG = { rampProxy: 1, climbable: 2 } as const;
export type JcolKind = 'triMesh' | 'box' | 'capsule' | 'cylinder' | 'convexHull';
interface JcolShapeBase {
  /** physics ObjectLayer 값(08-physics §3). */
  layer: number;
  /** `JCOL_MATERIAL` 값. */
  material: number;
  /** `JCOL_FLAG` 비트. */
  flags: number;
  /** 셀 로컬 미터(f32로 저장). */
  posLocal: Vec3Tuple;
  /** 단위 쿼터니언 (x, y, z, w). */
  quat: [number, number, number, number];
}
export interface JcolTriMesh extends JcolShapeBase {
  kind: 'triMesh';
  /** xyz × vCount (셰이프 로컬). */
  vertices: Float32Array;
  /** 삼각형 인덱스, 길이 3의 배수, 모두 < vCount. */
  indices: Uint32Array;
}
export interface JcolConvexHull extends JcolShapeBase {
  kind: 'convexHull';
  vertices: Float32Array;
}
export interface JcolBox extends JcolShapeBase {
  kind: 'box';
  halfExtents: Vec3Tuple;
}
export interface JcolRound extends JcolShapeBase {
  kind: 'capsule' | 'cylinder';
  halfHeight: number;
  radius: number;
}
export type JcolShape = JcolTriMesh | JcolConvexHull | JcolBox | JcolRound;

// ── lanes.bin (05 §7). SoA — sim 워커 핫루프용 ──

export interface LaneGraphChunk {
  /** portalKey 0 = 셀 내부 노드, 그 외 = 이웃 셀과 병합할 글로벌 노드 해시. */
  nodes: { id: Uint32Array; posLocal: Float32Array; portalKey: Uint32Array };
  /** fromNode/toNode = 이 청크 `nodes` 배열 인덱스. signalGroup = groups.id 또는 LANE_NO_SIGNAL.
   *  ptOffset/ptCount = pointsLocal 점(xyz) 단위 범위. kind: 0 road, 1 turn, 2 bus. */
  lanes: {
    id: Uint32Array;
    fromNode: Uint32Array;
    toNode: Uint32Array;
    kind: Uint8Array;
    speedKmh: Uint8Array;
    signalGroup: Uint16Array;
    ptOffset: Uint32Array;
    ptCount: Uint16Array;
    widthCm: Uint16Array;
  };
  /** 차선 중심선 점 xyz(셀 로컬). */
  pointsLocal: Float32Array;
  groups: { id: Uint16Array; intersection: Uint16Array; phaseIndex: Uint8Array };
}

// ── 셀 데이터 모델 (디코드 결과. 이 블록이 정의 원본) ──

export interface DecodedMesh {
  primitives: Array<{
    materialId: string;
    /** HLOD 자식 그룹 0..15. */
    child?: number;
    /**
     * 키 = glTF 의미 이름(`POSITION`, `NORMAL`, `TEXCOORD_0`, `_SURF`, `_BLDG`, `_FACADE`). 배열은 밀집(인터리브 없음).
     * POSITION은 셀 로컬 미터 float32(양자화는 디코더가 해제). ADR-0020.
     */
    attributes: Record<string, { array: ArrayBufferView; itemSize: number; normalized: boolean }>;
    index?: Uint32Array | Uint16Array;
    boundsLocal: { min: Vec3Tuple; max: Vec3Tuple };
  }>;
}
export type MeshSlot = 'terrain' | 'buildings' | 'roads' | 'decals' | 'overrides' | 'hlod';
export interface CellPayload {
  key: CellKey;
  id: CellId;
  level: CellLevel;
  originWF: Vec3d;
  header: CellHeader;
  meshes: Partial<Record<MeshSlot, DecodedMesh>>;
  heightfield?: HeightfieldData;
  instances?: { props?: PropBatch[]; trees?: TreeBatch };
  /** requestSections로만 채워짐(onReady payload에는 없음). */
  collision?: ArrayBuffer;
  nav?: ArrayBuffer;
  lanes?: ArrayBuffer;
  lights?: LightRecord[];
  audio?: AudioZones;
  meta?: CellMeta;
}
/** terrain.height 디코드 결과. h(m) = minH + data[iz*size + ix] * step. (ix, iz)=(0,0)은 셀 북서 모서리(로컬 x=0, z=0). */
export interface HeightfieldData {
  size: number;
  minH: number;
  step: number;
  data: Uint16Array;
}
export interface PropBatch {
  typeId: number;
  /** x, y, z, yaw, scale (셀 로컬) × count. */
  transforms: Float32Array;
}
export interface TreeBatch {
  count: number;
  records: ArrayBuffer;
}
export interface LightRecord {
  kind: number;
  schedule: number;
  kelvin: number;
  posLocal: Vec3Tuple;
  dirOct: [number, number];
  lumen: number;
  range: number;
}
export interface AudioZones {
  zones: Array<{ kind: string; polygonLocal: [number, number][]; y0: number; y1: number }>;
  emitters: Array<{ kind: string; pos: Vec3Tuple }>;
}

// ── meta.json (schemas/cell-meta.schema.json과 일치) ──

export interface I18nText {
  ja: string;
  en: string;
  ko: string;
}
export interface MetaBuilding {
  gmlId: string;
  usage: string;
  height: number;
  storeys?: number;
  name?: string;
  override?: boolean;
}
export type PoiKind = 'landmark' | 'street' | 'park' | 'shrine' | 'temple' | 'viewpoint' | 'station' | 'other';
export interface MetaPoi {
  id: string;
  kind: PoiKind;
  posLocal: Vec3Tuple;
  radius: number;
  nameI18n: I18nText;
  wikidataId?: string;
  descriptionKey: string;
}
export interface MetaPlaceName {
  code: string;
  nameI18n: Partial<I18nText>;
  polygonLocal: [number, number][];
}
export interface MetaSignal {
  intersectionId: number;
  heads: Array<{ kind: 'vehicle' | 'pedestrian' | 'arrow'; posLocal: Vec3Tuple; yaw: number; group: number }>;
}
export interface InteractableRecord {
  id: string;
  kind: 'seat' | 'bikeDock' | 'carShare' | 'gate' | 'viewpoint' | 'door';
  posLocal: Vec3Tuple;
  yaw?: number;
  radius: number;
}
export interface CellMeta {
  buildings: MetaBuilding[];
  pois: MetaPoi[];
  placeNames: MetaPlaceName[];
  signals: MetaSignal[];
  interactables: InteractableRecord[];
}
