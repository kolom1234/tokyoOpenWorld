// 자산 zip → 레이어 PNG(ImageMagick: 리사이즈·ORM 채널 패킹) → KTX2 배열(toktx: 알베도 ETC1S sRGB, 법선·ORM UASTC+RDO+zstd, 밉맵).
// 컨테이너 전용(magick·toktx·unzip). see docs/07-rendering.md §4, tools/pipeline/Dockerfile
import { execFile } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BIG = { maxBuffer: 64 * 1024 * 1024 };

/** 맵 접미사(ambientCG 1K-JPG). AO·Metalness는 없는 자산이 있다(→ 흰색·검정). */
const MAPS = {
  color: 'Color',
  normal: 'NormalGL',
  rough: 'Roughness',
  ao: 'AmbientOcclusion',
  metal: 'Metalness',
} as const;
type MapKey = keyof typeof MAPS;

/** 인코더 설정(캐시 해시에 포함). */
export const ENCODE_ARGS = {
  albedo: ['--encode', 'etc1s', '--clevel', '4', '--qlevel', '255', '--assign_oetf', 'srgb'],
  normal: [
    '--encode',
    'uastc',
    '--uastc_quality',
    '2',
    '--uastc_rdo_l',
    '1.0',
    '--zcmp',
    '19',
    '--assign_oetf',
    'linear',
  ],
  orm: ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '2.0', '--zcmp', '19', '--assign_oetf', 'linear'],
} as const;

export interface LayerImages {
  albedo: string;
  normal: string;
  orm: string;
  avgColor: [number, number, number];
  avgOrm: [number, number, number];
}

async function extractMaps(zip: string, asset: string, dir: string): Promise<Partial<Record<MapKey, string>>> {
  const { stdout } = await run('unzip', ['-Z1', zip], BIG);
  const names = stdout.split('\n').map((s) => s.trim());
  const found: Partial<Record<MapKey, string>> = {};
  const members: string[] = [];
  for (const [k, suffix] of Object.entries(MAPS) as [MapKey, string][]) {
    const m = names.find((n) => n === `${asset}_1K-JPG_${suffix}.jpg`);
    if (m) {
      found[k] = join(dir, m);
      members.push(m);
    }
  }
  if (!found.color || !found.normal || !found.rough) throw new Error(`${zip}: missing Color/NormalGL/Roughness`);
  await run('unzip', ['-o', '-q', '-j', zip, ...members, '-d', dir], BIG);
  return found;
}

/** 한 채널(R)을 크기 맞춰 꺼내는 magick 인자 그룹. 없으면 단색. */
function channel(file: string | undefined, fill: 'white' | 'black', size: number): string[] {
  const src = file ?? `xc:${fill}`;
  const pre = file ? [] : ['-size', `${size}x${size}`];
  return ['(', ...pre, src, '-resize', `${size}x${size}!`, '-channel', 'R', '-separate', '+channel', ')'];
}

async function meanRgb(file: string): Promise<[number, number, number]> {
  const { stdout } = await run('magick', [file, '-resize', '1x1!', '-format', '%[fx:r] %[fx:g] %[fx:b]', 'info:'], BIG);
  const v = stdout.trim().split(/\s+/).map(Number);
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0].map((x) => Math.round(x * 1000) / 1000) as [number, number, number];
}

/** zip 1개 → 레이어 PNG 3장(알베도 size², 법선·ORM detail², 8-bit RGB) + 평균값. */
export async function prepareLayer(
  zip: string,
  asset: string,
  workDir: string,
  size: number,
  detail: number,
): Promise<LayerImages> {
  const dir = join(workDir, asset);
  mkdirSync(dir, { recursive: true });
  const m = await extractMaps(zip, asset, dir);
  const out = { albedo: join(dir, 'albedo.png'), normal: join(dir, 'normal.png'), orm: join(dir, 'orm.png') };
  const rgb = ['-define', 'png:color-type=2', '-depth', '8', '-strip'];
  await run('magick', [m.color as string, '-resize', `${size}x${size}!`, ...rgb, out.albedo], BIG);
  await run('magick', [m.normal as string, '-resize', `${detail}x${detail}!`, ...rgb, out.normal], BIG);
  await run(
    'magick',
    [
      ...channel(m.ao, 'white', detail),
      ...channel(m.rough, 'white', detail),
      ...channel(m.metal, 'black', detail),
      '-set',
      'colorspace',
      'sRGB',
      '-combine',
      ...rgb,
      out.orm,
    ],
    BIG,
  );
  return { ...out, avgColor: await meanRgb(out.albedo), avgOrm: await meanRgb(out.orm) };
}

/** 레이어 PNG 목록 → KTX2 배열 1개(밉맵 포함). 반환 = 바이트 수. */
export async function encodeArray(
  kind: keyof typeof ENCODE_ARGS,
  inputs: readonly string[],
  out: string,
): Promise<number> {
  const args = ['--t2', '--genmipmap', '--layers', String(inputs.length), ...ENCODE_ARGS[kind], out, ...inputs];
  await run('toktx', args, BIG);
  return statSync(out).size;
}
