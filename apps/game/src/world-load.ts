// 부트 4단계(데이터 로드): world.json(원점·포맷 검증) → cells.idx → 스폰 주변 L0 셀 TKC(헤더 확인 + 리더 보관). 스트리밍 전 임시 로더.
// M02 streaming(디코드 워커)이 들어오면 셀 fetch·검증은 거기로 옮기고 여기엔 매니페스트 검증만 남긴다. see docs/modules/game.md, docs/05-tile-format.md §1–3
import { type CellKey, cellIdString, err, ok, packCellKey, type Result, type Vec3d } from '@sanpo/core';
import { cellOf, WORLD_ORIGIN } from '@sanpo/geo';
import { type CellsIndex, FORMAT_VERSION, readCellsIndex, readTkc, type TkcReader } from '@sanpo/tile-format';

/** 저장소 픽스처 world-mini(tests/fixtures/world-mini)의 정적 경로. `?world=mini`로 선택(vite.config.ts가 서빙·복사). */
export const WORLD_MINI_BASE_URL = '/fixtures/world-mini';

export type WorldSource = 'api' | 'fixture';

interface WorldManifest {
  formatVersion: number;
  buildId: string;
  crs: { projected: string; E0: number; N0: number };
  spawn: { posWF: [number, number, number] };
  files: { cellsIndex: string };
}

export interface LoadedCell {
  key: CellKey;
  id: string;
  bytes: number;
  sections: string[];
  /** 검증된 TKC 리더(섹션 view — 원본 바이트 보유). M01-T06 debug/local-cells.ts가 메시로 변환(M02-T05에서 streaming으로 대체). */
  tkc: TkcReader;
}

export interface LoadedWorld {
  source: WorldSource;
  baseUrl: string;
  buildId: string;
  /** world.json spawn.posWF(WF m). */
  spawnWF: Vec3d;
  /** cells.idx 레코드 수(모든 레벨). */
  indexed: number;
  /** 스폰 셀 ± 1 안에서 받아 헤더를 확인한 L0 셀. */
  cells: LoadedCell[];
}

type FetchLike = (input: string) => Promise<Response>;

async function getBytes(fetchFn: FetchLike, url: string): Promise<Result<Uint8Array, string>> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return err(`${url}: HTTP ${res.status}`);
    return ok(new Uint8Array(await res.arrayBuffer()));
  } catch (e) {
    return err(`${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** world.json 파싱 + 포맷 버전·좌표 원점(@sanpo/geo WORLD_ORIGIN) 일치 검사. */
export function checkManifest(text: string): Result<WorldManifest, string> {
  let w: WorldManifest;
  try {
    w = JSON.parse(text) as WorldManifest;
  } catch {
    return err('world.json: not JSON (missing file served as SPA fallback?)');
  }
  if (w?.formatVersion !== FORMAT_VERSION)
    return err(`world.json: formatVersion ${w?.formatVersion} ≠ ${FORMAT_VERSION}`);
  const c = w.crs;
  if (c?.projected !== WORLD_ORIGIN.epsg || c.E0 !== WORLD_ORIGIN.E0 || c.N0 !== WORLD_ORIGIN.N0) {
    return err(`world.json: crs ${JSON.stringify(c)} ≠ WORLD_ORIGIN`);
  }
  if (!Array.isArray(w.spawn?.posWF) || typeof w.files?.cellsIndex !== 'string') return err('world.json: spawn/files');
  return ok(w);
}

/** 스폰 셀과 8방향 이웃 중 색인에 있는 L0 셀(색인 순서). */
export function cellsAroundSpawn(index: CellsIndex, spawn: [number, number, number]): CellKey[] {
  const keys = new Set<CellKey>();
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) keys.add(cellOf(0, spawn[0] + dx * 256, spawn[2] + dz * 256));
  }
  return [...index.keys()].filter((k) => keys.has(k));
}

async function loadCell(
  fetchFn: FetchLike,
  baseUrl: string,
  key: CellKey,
  expect: { byteLength: number; buildId: string },
): Promise<Result<LoadedCell, string>> {
  const id = cellIdString(key);
  const [, ix, iz] = id.split('_');
  const bytes = await getBytes(fetchFn, `${baseUrl}/L0/${ix}/${iz}.tkc`);
  if (!bytes.ok) return bytes;
  if (bytes.value.byteLength !== expect.byteLength) return err(`${id}: ${bytes.value.byteLength} B ≠ cells.idx`);
  const r = readTkc(bytes.value);
  if (!r.ok) return err(`${id}: ${r.error.code} ${r.error.message}`);
  const h = r.value.header;
  if (packCellKey(h.cell.level, h.cell.ix, h.cell.iz) !== key || h.buildId !== expect.buildId) {
    return err(`${id}: header cell/buildId mismatch`);
  }
  return ok({ key, id, bytes: bytes.value.byteLength, sections: h.sections.map((s) => s.type), tkc: r.value });
}

/** world.json → cells.idx → 스폰 주변 셀. 실패는 예외 대신 Result(부트 화면 표시). */
export async function loadWorld(
  baseUrl: string,
  source: WorldSource,
  fetchFn: FetchLike = (u) => fetch(u),
): Promise<Result<LoadedWorld, string>> {
  const wj = await getBytes(fetchFn, `${baseUrl}/world.json`);
  if (!wj.ok) return wj;
  const m = checkManifest(new TextDecoder().decode(wj.value));
  if (!m.ok) return m;
  const idxBytes = await getBytes(fetchFn, `${baseUrl}/${m.value.files.cellsIndex}`);
  if (!idxBytes.ok) return idxBytes;
  const index = readCellsIndex(idxBytes.value);
  if (!index.ok) return err(`cells.idx: ${index.error.code} ${index.error.message}`);
  const cells: LoadedCell[] = [];
  for (const key of cellsAroundSpawn(index.value, m.value.spawn.posWF)) {
    const entry = index.value.get(key);
    if (!entry) continue;
    const c = await loadCell(fetchFn, baseUrl, key, { byteLength: entry.byteLength, buildId: m.value.buildId });
    if (!c.ok) return c;
    cells.push(c.value);
  }
  if (cells.length === 0) return err('no L0 cells around spawn');
  const [x, y, z] = m.value.spawn.posWF;
  const spawnWF = { x, y, z };
  return ok({ source, baseUrl, buildId: m.value.buildId, spawnWF, indexed: index.value.size, cells });
}
