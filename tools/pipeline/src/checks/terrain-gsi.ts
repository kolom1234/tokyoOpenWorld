// M01-T03 수락 검증: dem_1m.tif 표고 vs 地理院地図 표시값(GSI 표고 API) 비교 + GDAL/@sanpo/geo 투영 일치 확인. 네트워크 필요(CI 제외).
// 사용(컨테이너): node tools/pipeline/src/checks/terrain-gsi.ts [dem_1m.tif]
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '@sanpo/core';
import { lonLatToPrj } from '@sanpo/geo';

const run = promisify(execFile);
const log = createLogger().child('terrain-gsi');
/** 地理院地図가 표시하는 표고 API(같은 GSI DEM 계열, 1A > 5A > 5B > 10B 우선). */
const GSI_API = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';
/** 수락 기준(M01-T03): 스크램블 교차로 ±0.5 m. */
const TOLERANCE_M = 0.5;
/** GDAL(PROJ) 투영과 @sanpo/geo(proj4) 투영 허용 차(m). */
const PROJ_TOLERANCE_M = 1e-3;

interface Probe {
  name: string;
  lat: number;
  lon: number;
  /** true = 수락 기준 대상(스크램블 교차로). */
  accept: boolean;
}

/** 스크램블 교차로 중심 + 횡단보도 네 모서리 부근, 참고 지점(구역 내 다른 지형). */
const PROBES: Probe[] = [
  { name: 'Scramble center', lat: 35.6595, lon: 139.70055, accept: true },
  { name: 'Scramble NW', lat: 35.65968, lon: 139.7003, accept: true },
  { name: 'Scramble NE', lat: 35.65968, lon: 139.70085, accept: true },
  { name: 'Scramble SW', lat: 35.65925, lon: 139.7003, accept: true },
  { name: 'Scramble SE', lat: 35.65925, lon: 139.70085, accept: true },
  { name: 'Hachiko square', lat: 35.6591, lon: 139.7006, accept: false },
  { name: 'Harajuku sta.', lat: 35.67027, lon: 139.70265, accept: false },
  { name: 'Yoyogi Park', lat: 35.67167, lon: 139.69494, accept: false },
  { name: 'Shinjuku sta. S', lat: 35.68894, lon: 139.70037, accept: false },
];

async function gsiElevation(p: Probe): Promise<{ elevation: number | null; hsrc: string }> {
  const res = await fetch(`${GSI_API}?lon=${p.lon}&lat=${p.lat}&outtype=JSON`);
  const body = (await res.json()) as { elevation: number | string; hsrc: string };
  return { elevation: typeof body.elevation === 'number' ? body.elevation : null, hsrc: body.hsrc };
}

async function gdalPrj(p: Probe): Promise<{ e: number; n: number }> {
  const child = execFile('gdaltransform', ['-s_srs', 'EPSG:6668', '-t_srs', 'EPSG:6677', '-output_xy']);
  child.stdin?.end(`${p.lon} ${p.lat}\n`);
  const out = await new Promise<string>((ok, fail) => {
    let s = '';
    child.stdout?.on('data', (c: Buffer) => (s += c.toString()));
    child.on('close', (code) => (code === 0 ? ok(s) : fail(new Error(`gdaltransform exit ${code}`))));
  });
  const [e, n] = out.trim().split(/\s+/).map(Number);
  return { e: e as number, n: n as number };
}

async function demAt(tif: string, e: number, n: number): Promise<number> {
  const { stdout } = await run('gdallocationinfo', [
    '-valonly',
    '-r',
    'bilinear',
    '-geoloc',
    tif,
    String(e),
    String(n),
  ]);
  return Number(stdout.trim());
}

async function main(tif: string): Promise<void> {
  const rows: string[] = [
    '| 지점 | 위도, 경도 | GSI 표시값 (m, 출처) | dem_1m (m) | 차 (m) | 판정 |',
    '|---|---|---|---|---|---|',
  ];
  let failed = 0;
  for (const p of PROBES) {
    const prj = lonLatToPrj({ lon: p.lon, lat: p.lat });
    const g = await gdalPrj(p);
    const projDiff = Math.hypot(g.e - prj.easting, g.n - prj.northing);
    if (projDiff > PROJ_TOLERANCE_M)
      throw new Error(`${p.name}: GDAL vs @sanpo/geo projection differ by ${projDiff} m`);
    const dem = await demAt(tif, prj.easting, prj.northing);
    const gsi = await gsiElevation(p);
    const diff = gsi.elevation === null ? Number.NaN : dem - gsi.elevation;
    const ok = Math.abs(diff) <= TOLERANCE_M;
    if (p.accept && !ok) failed++;
    const verdict = p.accept ? (ok ? 'PASS' : 'FAIL') : ok ? '(참고) ≤0.5' : '(참고) >0.5';
    rows.push(
      `| ${p.name} | ${p.lat}, ${p.lon} | ${gsi.elevation ?? '-'} (${gsi.hsrc}) | ${dem.toFixed(2)} | ${diff.toFixed(2)} | ${verdict} |`,
    );
  }
  process.stdout.write(`${rows.join('\n')}\n`);
  if (failed > 0) {
    log.error(`${failed} acceptance probe(s) outside ±${TOLERANCE_M} m`);
    process.exitCode = 1;
  }
}

await main(resolve(process.argv[2] ?? join(import.meta.dirname, '../../../../data/normalized/terrain/dem_1m.tif')));
