# @sanpo/tile-format
Layer: L1 | Depends: core | Used by: streaming(decode worker), physics(worker: JCOL), sim(worker: lanes), apps/worker(타입), apps/game(`FORMAT_VERSION`), tools/pipeline(encode)

## Purpose
TKC 셀 컨테이너, cells.idx, JCOL, lanes.bin, terrain.height의 인코더/디코더와 섹션 레지스트리. 포맷 스펙 = `docs/05-tile-format.md` (이 패키지가 유일 구현). 구현 결정 = ADR-0017.

## Public API (src/api.ts 타입·상수, src/index.ts 함수)
```ts
// 상수
TKC_MAGIC = 0x3143_4B54 /*"TKC1" LE*/; FORMAT_VERSION = 1; TKC_ALIGN = 16; TKC_PREAMBLE_BYTES = 16;
CELLS_INDEX_MAGIC /*"TKCI"*/; JCOL_MAGIC; JCOL_VERSION = 1; LANES_MAGIC; LANES_VERSION = 1; LANE_NO_SIGNAL = 0xFFFF;
HEIGHTFIELD_SIZE = 257; HEIGHTFIELD_STEP_M = 0.01; HEIGHTFIELD_BASE_M = -100 /*모든 셀 공통 minH, ADR-0018*/; CELL_FLAG = { override: 1, rail: 2 };
JCOL_MATERIAL = { concrete: 0, …, tile: 7 }; JCOL_FLAG = { rampProxy: 1, climbable: 2, escalator: 4 };   // bit2 = SENSOR 박스 에스컬레이터(로컬 +Z 진행, ADR-0044)
SECTION_REGISTRY: Record<SectionType, { codec: SectionCodec; levels: CellLevel[] }>   // 05 §4 표와 1:1
type SectionType = keyof typeof SECTION_REGISTRY;  type SectionCodec = 'glb'|'bin+gzip'|'json+gzip';   // 'bin' 제거(M06-T03 — nav.bin이 bin+gzip)
// 오류: 리더는 throw 대신 Result<T, TkcError>. writer의 잘못된 입력만 throw(프로그래밍 오류).
TkcErrorCode = { Truncated, Magic, Version, Flags, Header, Range, Align, Corrupt };  interface TkcError { code; message }
// TKC
interface SectionEntry { type: string; offset; length; codec: SectionCodec; sources: string[]; hash: string /* xxh64:<16hex> */ }
interface CellHeader { cell: { level: CellLevel; ix; iz }; buildId; originWF: Vec3Tuple; aabbWF: { min; max }; sections: SectionEntry[]; materials: string[]; stats: CellStats }
type CellHeaderInput = Omit<CellHeader, 'sections'>;  interface TkcSectionInput { type: SectionType; sources: readonly string[]; data: Uint8Array }
interface TkcReader { header: CellHeader; section(t: SectionType): Uint8Array | undefined /* 원본 view */; entry(t): SectionEntry | undefined }
writeTkc(header: CellHeaderInput, sections: readonly TkcSectionInput[]): Uint8Array   // data는 코덱대로 이미 인코딩된 바이트
readTkc(buf: ArrayBuffer | Uint8Array): Result<TkcReader, TkcError>
verifyTkc(r: TkcReader): Result<true, TkcError>;  sectionHash(data): string;  isSectionType(s): s is SectionType
// cells.idx
interface CellsIndexEntry { level; ix; iz; flags; byteLength; hash32 };  type CellsIndex = ReadonlyMap<CellKey, { flags; byteLength; hash32 }>
writeCellsIndex(entries): Uint8Array;  readCellsIndex(buf): Result<CellsIndex, TkcError>;  tkcHash32(tkcBytes): number
// JCOL (collision.bin, gzip 해제 후)
type JcolShape = JcolTriMesh{vertices,indices} | JcolConvexHull{vertices} | JcolBox{halfExtents} | JcolRound{kind:'capsule'|'cylinder'; halfHeight; radius}
  // 공통: layer, material, flags, posLocal: Vec3Tuple, quat: [x,y,z,w]
writeJcol(shapes): Uint8Array;  parseJcol(bytes): Result<JcolShape[], TkcError>
// lanes.bin (gzip 해제 후) — SoA
interface LaneGraphChunk { nodes{id,posLocal,portalKey}; lanes{id,fromNode,toNode,kind,speedKmh,signalGroup,ptOffset,ptCount,widthCm}; pointsLocal; groups{id,intersection,phaseIndex} }
writeLanes(g): Uint8Array;  parseLanes(bytes): Result<LaneGraphChunk, TkcError>
// nav.bin (gzip 해제 후, M06-T03 ADR-0063 — 타입은 api-nav.ts, api.ts가 재수출): Detour 타일(WF, 64 m) + 횡단보도 기록
NAV_MAGIC /*"NAVT"*/; NAV_VERSION = 1; NAV_TILE_M = 64; NAV_NO_SIGNAL = 0xFFFFFFFF; NAV_AREA = { sidewalk: 1, street: 2, crossing: 3, open: 4 }; NAV_FLAG = { walk: 1, cross: 2 };
interface NavCrossing { id; a: [x,y,z]; b; halfWidth; signal }  interface NavTile { tx; tz; data: Uint8Array }  interface NavCellData { tiles; crossings }
writeNav(d: NavCellData): Uint8Array;  parseNav(bytes): Result<NavCellData, TkcError>   // 매직·버전·길이·비유한 검사, 타일 바이트는 Detour가 검사
// terrain.height (gzip 해제 후)
writeHeightfield(hf: HeightfieldData): Uint8Array;  parseHeightfield(bytes): Result<HeightfieldData, TkcError>
quantizeHeightfield(heightsM: ArrayLike<number>, size, step = 0.01, minH = HEIGHTFIELD_BASE_M): HeightfieldData  // 범위 밖·비유한 throw
// props.inst (gzip 해제 후, M05-T03 ADR-0051): 반복 {u16 typeId, u16 pad, u32 count, f32[count×5]} — 길이 부족 = Truncated, count 0·비유한 = Corrupt
writeProps(batches: PropBatch[]): Uint8Array;  parseProps(bytes): Result<PropBatch[], TkcError>
// trees.inst (M05-T04 ADR-0052): {u32 count} + 24 B 레코드
writeTrees(records: TreeRecord[]): Uint8Array;  parseTrees(bytes): Result<TreeBatch, TkcError>;  treeRecordAt(batch, i): TreeRecord;  TREE_RECORD_BYTES = 24
TREE_SPECIES = { ginkgo: 1, zelkova: 2, cherry: 3, camphor: 4, pine: 5, shrub: 6 }; TreeSpeciesName; TreeRecord { species, seed, x, y, z, height, crownR }
PROP_TYPE = { utilityPole: 1, streetLamp: 2, signalVehicle: 3, signalPedestrian: 4, vendingMachine: 5, guardRail: 6, bollard: 7, signStop: 8, postBox: 9, bicycleRack: 10, busStop: 11, manhole: 12, bench: 13, phoneBooth: 14, wasteBasket: 15, signProjecting: 16, signStanding: 17, signRooftop: 18 }; PropTypeName  // 번호는 추가만, 16–18 = 가상 간판(M05-T06, render 간판 필드)
// gzip (Compression/DecompressionStream)
gzip(bytes): Promise<Uint8Array>   // mtime 0, OS 바이트 0xFF → 같은 런타임에서 결정론
gunzip(bytes): Promise<Result<Uint8Array, TkcError>>
// ── 셀 데이터 모델 (정의 원본 = src/api.ts) ──
DecodedMesh, MeshSlot, CellPayload, HeightfieldData{size,minH,step,data:Uint16Array}, PropBatch, TreeBatch, LightRecord, AudioZones,
CellMeta{buildings: MetaBuilding[]; pois: MetaPoi[]; placeNames: MetaPlaceName[]; signals: MetaSignal[]; interactables: InteractableRecord[]}  // = schemas/cell-meta.schema.json
```

## 파이프라인 사용 예 (tools/pipeline `stages/build/assemble.ts`)
```ts
const hf = await gzip(writeHeightfield(quantizeHeightfield(heights257x257, HEIGHTFIELD_SIZE)));
const meta = await gzip(new TextEncoder().encode(JSON.stringify(cellMeta)));
const tkc = writeTkc(header, [{ type: 'terrain.mesh', sources: ['gsi-dem'], data: glb }, { type: 'terrain.height', sources: ['gsi-dem'], data: hf },
  { type: 'meta.json', sources: ['plateau-shibuya'], data: meta }]);
indexEntries.push({ level: 0, ix, iz, flags: 0, byteLength: tkc.byteLength, hash32: tkcHash32(tkc) });  // → writeCellsIndex
```

## Invariants
- 리틀엔디언, 섹션 16바이트 정렬, 오프셋은 파일 절대값. 헤더 JSON 고정 키 순서, 섹션 `type` 사전순, sources 정렬·중복 제거 → 결정론(05 §3.1).
- 미지 섹션·추가 헤더 필드는 읽기 시 무시(범위·정렬 검사는 적용). `formatVersion` 불일치 → `version`, flags ≠ 0 → `flags`.
- 섹션 view·JCOL 배열은 입력 버퍼를 공유(정렬 시 zero-copy). 입력을 transfer하면 무효. lanes·heightfield 결과는 사본.
- glb 디코드(meshopt)는 이 패키지가 아니라 streaming decode worker 책임(여기선 바이트 + 데이터 모델 타입만).
- `DecodedMesh.attributes` 키 = glTF 의미 이름(`POSITION`·`NORMAL`·`TEXCOORD_0`·`_BLDG`…), 밀집 배열, POSITION = 셀 로컬 float32(양자화 해제) — ADR-0020.
- JSON Schema 검증(ajv, devDependency)은 테스트와 tools/pipeline validate에서만. 런타임은 손으로 쓴 구조 검사.

## Files
src/api.ts(계약·레지스트리·모델), src/index.ts, src/internal/: tkc-writer.ts, tkc-reader.ts, header-check.ts(구조 검사·정규 직렬화), sections.ts(레지스트리 조회·해시·정렬),
cells-index.ts, jcol.ts, lanes.ts, heightfield.ts, props.ts(M05-T03), trees.ts(M05-T04), gzip.ts, xxh64.ts, bytes.ts(LE 읽기/쓰기). 모델 타입은 Hard Rule 4에 따라 api.ts에(별도 model.ts 없음).

## Tests
test/tkc.test.ts(round-trip 바이트 동일·결정론·정렬·손상 거부·미지 섹션), schema.test.ts(ajv: cell-header·cell-meta), binary.test.ts(cells.idx·JCOL·lanes·heightfield·gzip), hash.test.ts(XXH64 골든), props.test.ts(props.inst 왕복·손상 거부), trees.test.ts(trees.inst 왕복·손상 거부). 픽스처는 합성(test/fixtures.ts).

## Status
구현 완료 (M01-T04). M01-T05: terrain.height 공통 기준(ADR-0018). props.inst = M05-T03(ADR-0051). trees.inst·lights.bin 인코더는 해당 태스크에서 추가.

## Gotchas
- 섹션 추가 시 05 문서 §4 레지스트리 표와 `SECTION_REGISTRY`(api.ts) 동시 갱신.
- `quantizeHeightfield`는 기본값으로 공통 기준(−100 m)·스텝을 쓴다 → 같은 높이 = 같은 u16(이웃 경계 비트 일치, ADR-0018). 셀별 min을 넘기면 이 성질이 깨진다.
- gzip 바이트는 런타임 zlib 버전에 의존 → 파이프라인 재현성 검사는 같은 컨테이너에서.
