# @sanpo/tile-format
Layer: L1 | Depends: core | Used by: streaming(decode worker), physics(worker: JCOL), sim(worker: lanes), apps/worker(타입), tools/pipeline(encode)

## Purpose
TKC 셀 컨테이너, cells.idx, JCOL, lanes.bin의 인코더/디코더와 섹션 레지스트리. 포맷 스펙 = `docs/05-tile-format.md` (이 패키지가 유일 구현).

## Public API (src/api.ts)
```ts
export const TKC_MAGIC = 0x3143_4B54;  // "TKC1" LE
export const FORMAT_VERSION = 1;
export type SectionType = 'terrain.mesh'|'terrain.height'|'buildings.mesh'|'roads.mesh'|'decals.mesh'|'overrides.mesh'
  |'props.inst'|'trees.inst'|'collision.bin'|'nav.bin'|'lanes.bin'|'lights.bin'|'audio.json'|'meta.json'|'hlod.mesh';
export type SectionCodec = 'glb' | 'bin' | 'bin+gzip' | 'json+gzip';
export interface SectionEntry { type: SectionType | string; offset: number; length: number; codec: SectionCodec; sources: string[]; hash: string }
export interface CellHeader { cell: { level: number; ix: number; iz: number }; buildId: string; originWF: [number, number, number];
  aabbWF: { min: [number, number, number]; max: [number, number, number] }; sections: SectionEntry[]; materials: string[]; stats: CellStats }
export interface TkcReader { header: CellHeader; section(type: SectionType): Uint8Array | undefined }  // 원본 버퍼 view(복사 없음)
export function readTkc(buf: ArrayBuffer): Result<TkcReader, TkcError>;
export function writeTkc(header: Omit<CellHeader, 'sections'>, sections: Array<{ type: SectionType; codec: SectionCodec; sources: string[]; data: Uint8Array }>): Uint8Array;
export function readCellsIndex(buf: ArrayBuffer): CellsIndex;   // Map<CellKey, {byteLength, hash32, flags}>
export function writeCellsIndex(entries: CellsIndexEntry[]): Uint8Array;
export function parseJcol(bytes: Uint8Array): JcolShape[];  export function writeJcol(shapes: JcolShape[]): Uint8Array;
export function parseLanes(bytes: Uint8Array): LaneGraphChunk; export function writeLanes(g: LaneGraphChunk): Uint8Array;
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array>;   // DecompressionStream (브라우저/Node 22+ 공통)
// ── 셀 데이터 모델 (디코드 결과. 이 블록이 정의 원본) ──
export interface DecodedMesh {
  primitives: Array<{
    materialId: string; child?: number;           // HLOD 자식 그룹
    attributes: Record<string, { array: ArrayBufferView; itemSize: number; normalized: boolean }>;
    index?: Uint32Array | Uint16Array;
    boundsLocal: { min: [number, number, number]; max: [number, number, number] };
  }>;
}
export interface CellPayload {
  key: CellKey; id: string; level: 0|1|2|3; originWF: Vec3d; header: CellHeader;
  meshes: Partial<Record<'terrain'|'buildings'|'roads'|'decals'|'overrides'|'hlod', DecodedMesh>>;
  heightfield?: HeightfieldData;
  instances?: { props?: PropBatch[]; trees?: TreeBatch };
  collision?: ArrayBuffer;      // requestSections로만 채워짐(onReady payload에는 없음)
  nav?: ArrayBuffer; lanes?: ArrayBuffer; lights?: LightRecord[]; audio?: AudioZones; meta?: CellMeta;
}
export interface HeightfieldData { size: number; minH: number; step: number; data: Uint16Array }
export interface PropBatch { typeId: number; transforms: Float32Array /* x,y,z,yaw,scale (셀 로컬) */ }
export interface TreeBatch { count: number; records: ArrayBuffer }
export interface LightRecord { kind: number; schedule: number; kelvin: number; posLocal: [number, number, number]; dirOct: [number, number]; lumen: number; range: number }
export interface AudioZones { zones: Array<{ kind: string; polygonLocal: [number, number][]; y0: number; y1: number }>; emitters: Array<{ kind: string; pos: [number, number, number] }> }
export interface InteractableRecord { id: string; kind: 'seat'|'bikeDock'|'carShare'|'gate'|'viewpoint'|'door'; posLocal: [number, number, number]; yaw?: number; radius: number }
export interface CellMeta { buildings: unknown[]; pois: unknown[]; placeNames: unknown[]; signals: unknown[]; interactables: InteractableRecord[] }  // 나머지 필드 형태 = schemas/cell-meta.schema.json (json-schema-to-typescript로 생성 권장)
```

## Invariants
- 리틀엔디언, 섹션 16바이트 정렬, 오프셋은 파일 절대값.
- `writeTkc`는 섹션을 `type` 사전순으로 배치(결정론).
- 미지 섹션은 읽기 시 무시. `formatVersion` 불일치 시 `TkcError.Version`.
- glb 디코드(meshopt)는 이 패키지가 아니라 streaming decode worker 책임(여기선 바이트 + 데이터 모델 타입만).
- JSON Schema 검증(ajv)은 여기 두지 않는다 → tools/pipeline validate 단계와 테스트에서만.

## Files
tkc-writer.ts, tkc-reader.ts, cells-index.ts, jcol.ts, lanes.ts, sections.ts(레지스트리·코덱 상수), gzip.ts, model.ts(셀 데이터 모델 타입).

## Tests
round-trip(바이트 동일), 손상 입력(짧은 버퍼, 잘못된 매직, 범위 밖 오프셋) 거부, 정렬 검사, JSON Schema 일치(`schemas/cell-header.schema.json`).

## Status
미구현 (M01-T04).

## Gotchas
- 섹션 추가 시 05 문서 §4 레지스트리 표와 `sections.ts` 동시 갱신.
