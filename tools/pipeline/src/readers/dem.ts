// GSI 基盤地図情報 数値標高モデル(JPGIS GML, DEM1A/5A 등) 리더: zip 속 3차 메시 xml → Float32 격자 + GDAL용 VRT. see docs/04-data-pipeline.md §4.2(terrain)
// 좌표 변환은 하지 않는다: 격자는 원천 위경도(JGD2011/2024 수평 = EPSG:6668) 그대로 VRT에 기록하고 재투영은 GDAL(normalize-terrain.ts)이 한다.
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 결측값. GSI 원천도 データなし·海水面을 -9999.로 기록한다(内水面은 수면 표고 값 있음). */
export const DEM_NODATA = -9999;

export interface DemTile {
  /** 3차 메시 코드(8자리). */
  mesh: string;
  /** 예: "1mメッシュ（標高）". */
  type: string;
  /** 원천 좌표계 표기(예: "fguuid:jgd2024.bl"). */
  srsName: string;
  cols: number;
  rows: number;
  /** 메시 외곽(도). 격자 값은 셀 면적 대표값(PixelIsArea). */
  south: number;
  west: number;
  north: number;
  east: number;
  /** 행 우선(북→남, 서→동), 결측 = DEM_NODATA. */
  values: Float32Array;
  /** 점 종류별 개수(地表面·内水面·データなし·海水面 …). */
  pointTypes: Record<string, number>;
}

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`).exec(xml);
  if (!m) throw new Error(`FGD DEM: <${name}> not found`);
  return (m[1] as string).trim();
}

function pair(text: string): [number, number] {
  const [a, b] = text.split(/\s+/).map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`FGD DEM: bad pair "${text}"`);
  return [a as number, b as number];
}

/** tupleList("種別,値" 줄) → values[start…]. 뒤쪽 생략분·startPoint 이전은 결측으로 남는다. */
function fillTuples(xml: string, values: Float32Array, start: number, types: Record<string, number>): void {
  const open = xml.indexOf('<gml:tupleList>');
  const close = xml.indexOf('</gml:tupleList>', open);
  if (open < 0 || close < 0) throw new Error('FGD DEM: <gml:tupleList> not found');
  let i = start;
  let pos = open + '<gml:tupleList>'.length;
  while (pos < close) {
    let eol = xml.indexOf('\n', pos);
    if (eol < 0 || eol > close) eol = close;
    const comma = xml.indexOf(',', pos);
    if (comma > 0 && comma < eol) {
      const kind = xml.slice(pos, comma).trim();
      types[kind] = (types[kind] ?? 0) + 1;
      const v = Number(xml.slice(comma + 1, eol));
      if (i < values.length) values[i] = Number.isFinite(v) && v > DEM_NODATA ? v : DEM_NODATA;
      i++;
    }
    pos = eol + 1;
  }
}

/** FGD DEM xml 1개 파싱. 정렬 규칙은 `+x-y`(서→동, 북→남)만 지원. */
export function parseFgdDem(xml: string): DemTile {
  const order = /<gml:sequenceRule order="([^"]+)"/.exec(xml)?.[1];
  if (order !== '+x-y') throw new Error(`FGD DEM: unsupported sequenceRule order "${order}"`);
  const [south, west] = pair(tag(xml, 'gml:lowerCorner'));
  const [north, east] = pair(tag(xml, 'gml:upperCorner'));
  const [hx, hy] = pair(tag(xml, 'gml:high'));
  const [sx, sy] = pair(tag(xml, 'gml:startPoint'));
  const cols = hx + 1;
  const rows = hy + 1;
  const values = new Float32Array(cols * rows).fill(DEM_NODATA);
  const pointTypes: Record<string, number> = {};
  fillTuples(xml, values, sy * cols + sx, pointTypes);
  const srsName = /<gml:Envelope srsName="([^"]+)"/.exec(xml)?.[1] ?? '';
  return {
    mesh: tag(xml, 'mesh'),
    type: tag(xml, 'type'),
    srsName,
    cols,
    rows,
    south,
    west,
    north,
    east,
    values,
    pointTypes,
  };
}

/** zip 안의 xml 멤버 이름(정렬). */
export async function listDemZip(zipPath: string): Promise<string[]> {
  const { stdout } = await run('unzip', ['-Z1', zipPath], { maxBuffer: 1 << 24 });
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.xml'))
    .sort();
}

/** 멤버 이름 "FG-GML-5339-35-96-DEM1A-20250822.xml" → 3차 메시 "53393596". */
export function meshOfMember(name: string): string | null {
  const m = /FG-GML-(\d{4})-(\d{2})-(\d{2})-DEM/.exec(name);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** zip 멤버 1개를 압축 해제 없이 읽는다(unzip -p). */
export function readZipMember(zipPath: string, member: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks).toString('utf8'))
        : reject(new Error(`unzip -p ${member}: exit ${code}`)),
    );
  });
}

/**
 * 타일을 `<dir>/<mesh>.bin`(Float32 LE) + `<mesh>.vrt`로 기록하고 VRT 경로를 반환.
 * SRS는 EPSG:6668(경도·위도 순 매핑) — JGD2024 수평좌표는 JGD2011과 같다(GSI 2025 개정, 수직만 변경).
 */
export function writeTileVrt(tile: DemTile, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const bin = `${tile.mesh}.bin`;
  const buf = Buffer.from(tile.values.buffer, tile.values.byteOffset, tile.values.byteLength);
  writeFileSync(join(dir, bin), buf);
  const gt = [tile.west, (tile.east - tile.west) / tile.cols, 0, tile.north, 0, -(tile.north - tile.south) / tile.rows];
  const vrt = `<VRTDataset rasterXSize="${tile.cols}" rasterYSize="${tile.rows}">
  <SRS dataAxisToSRSAxisMapping="2,1">EPSG:6668</SRS>
  <GeoTransform>${gt.map((v) => v.toPrecision(17)).join(', ')}</GeoTransform>
  <VRTRasterBand dataType="Float32" band="1" subClass="VRTRawRasterBand">
    <NoDataValue>${DEM_NODATA}</NoDataValue>
    <SourceFilename relativeToVRT="1">${bin}</SourceFilename>
    <ImageOffset>0</ImageOffset>
    <PixelOffset>4</PixelOffset>
    <LineOffset>${tile.cols * 4}</LineOffset>
    <ByteOrder>LSB</ByteOrder>
  </VRTRasterBand>
</VRTDataset>
`;
  const path = join(dir, `${tile.mesh}.vrt`);
  writeFileSync(path, vrt);
  return path;
}
