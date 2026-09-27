// 래스터 유틸: 투영 격자 정의(PRJ 정수 m = 픽셀 중심), Float32 raw 입출력, GDAL VRT 기록, 결측 병합·통계. see docs/04-data-pipeline.md §4.2(terrain), §6
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/**
 * 투영 격자. 픽셀 (col,row) 중심 = (eMin + col, nMax − row) [m, EPSG:6677].
 * 정수 PRJ 좌표 = 정수 WF 좌표(원점이 정수)라 셀 경계 정점(04 §6: 256 m 경계 위 1 m 간격)이 보간 없이 픽셀 중심과 일치한다.
 */
export interface PrjGrid {
  epsg: 'EPSG:6677';
  eMin: number;
  nMax: number;
  width: number;
  height: number;
}

/** GDAL GeoTransform(픽셀 외곽 기준): 중심이 정수가 되도록 0.5 m 이동. */
export function geoTransformOf(g: PrjGrid): number[] {
  return [g.eMin - 0.5, 1, 0, g.nMax + 0.5, 0, -1];
}

/** gdalwarp `-te xmin ymin xmax ymax`(동·북 순). */
export function targetExtentOf(g: PrjGrid): number[] {
  return [g.eMin - 0.5, g.nMax - g.height + 0.5, g.eMin + g.width - 0.5, g.nMax + 0.5];
}

export function readFloat32(path: string, expectedLength: number): Float32Array {
  const buf = readFileSync(path);
  if (buf.byteLength !== expectedLength * 4) {
    throw new Error(`readFloat32: ${path} has ${buf.byteLength} bytes, expected ${expectedLength * 4}`);
  }
  // 복사해서 4바이트 정렬 보장(Buffer 풀 오프셋 회피). 리틀엔디언 호스트 전제(x86·arm64).
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Float32 raw + 같은 이름 .vrt(투영 격자)를 기록하고 VRT 경로 반환. */
export function writeGridVrt(binPath: string, values: Float32Array, g: PrjGrid, nodata: number): string {
  mkdirSync(dirname(binPath), { recursive: true });
  writeFileSync(binPath, Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  const vrtPath = binPath.replace(/\.bin$/, '.vrt');
  writeFileSync(
    vrtPath,
    `<VRTDataset rasterXSize="${g.width}" rasterYSize="${g.height}">
  <SRS dataAxisToSRSAxisMapping="2,1">${g.epsg}</SRS>
  <GeoTransform>${geoTransformOf(g).join(', ')}</GeoTransform>
  <VRTRasterBand dataType="Float32" band="1" subClass="VRTRawRasterBand">
    <NoDataValue>${nodata}</NoDataValue>
    <SourceFilename relativeToVRT="1">${basename(binPath)}</SourceFilename>
    <ImageOffset>0</ImageOffset>
    <PixelOffset>4</PixelOffset>
    <LineOffset>${g.width * 4}</LineOffset>
    <ByteOrder>LSB</ByteOrder>
  </VRTRasterBand>
</VRTDataset>
`,
  );
  return vrtPath;
}

export interface FillStats {
  pixels: number;
  /** 주 데이터(DEM1A) 결측 픽셀. */
  primaryMissing: number;
  /** 그중 보조 데이터(DEM5A)로 채운 픽셀. */
  filledBySecondary: number;
  /** 둘 다 결측 → 보간 대상. */
  remaining: number;
}

/** primary 결측을 secondary 값으로 채운 새 배열 + 통계. */
export function mergeWithFallback(
  primary: Float32Array,
  secondary: Float32Array,
  nodata: number,
): { values: Float32Array; stats: FillStats } {
  const values = new Float32Array(primary.length);
  const stats: FillStats = { pixels: primary.length, primaryMissing: 0, filledBySecondary: 0, remaining: 0 };
  for (let i = 0; i < primary.length; i++) {
    const p = primary[i] as number;
    if (p !== nodata) {
      values[i] = p;
      continue;
    }
    stats.primaryMissing++;
    const s = secondary[i] as number;
    values[i] = s;
    if (s !== nodata) stats.filledBySecondary++;
    else stats.remaining++;
  }
  return { values, stats };
}

export interface ValueStats {
  count: number;
  nodata: number;
  min: number;
  max: number;
  mean: number;
}

export function valueStats(values: Float32Array, nodata: number): ValueStats {
  let [count, min, max, sum] = [0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0];
  for (const v of values) {
    if (v === nodata) continue;
    count++;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return { count, nodata: values.length - count, min: r(min), max: r(max), mean: r(sum / Math.max(count, 1)) };
}
