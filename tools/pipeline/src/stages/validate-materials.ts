// validate: 공유 머티리얼(shared/materials, M03-T01) — manifest 스키마·KTX2 파일 존재·바이트 수·레이어 인덱스·그룹 일관성. 없으면 건너뜀(픽스처 빌드).
// see docs/05-tile-format.md §1, schemas/materials.schema.json
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import type { MaterialsManifest } from './materials/library.ts';

export interface MaterialsReport {
  layers: number;
  bytes: number;
}

const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb];

/** 반환 = 요약(없으면 null). 오류는 errors에 추가. */
export function checkMaterials(dir: string, schema: ValidateFunction, errors: string[]): MaterialsReport | null {
  const mdir = join(dir, 'shared', 'materials');
  const path = join(mdir, 'manifest.json');
  if (!existsSync(path)) return null;
  const m = JSON.parse(readFileSync(path, 'utf8')) as MaterialsManifest;
  if (!schema(m)) {
    errors.push(`materials manifest: ${JSON.stringify(schema.errors?.slice(0, 3))}`);
    return null;
  }
  let bytes = 0;
  for (const t of Object.values(m.textures)) {
    const f = join(mdir, t.file);
    if (!existsSync(f)) {
      errors.push(`materials: ${t.file} missing`);
      continue;
    }
    const size = statSync(f).size;
    bytes += size;
    if (size !== t.bytes) errors.push(`materials: ${t.file} ${size} B ≠ manifest ${t.bytes}`);
    const head = readFileSync(f).subarray(0, 8);
    if (!KTX2_MAGIC.every((b, i) => head[i] === b)) errors.push(`materials: ${t.file} is not KTX2`);
  }
  if (m.layers.length !== m.layerCount)
    errors.push(`materials: layers ${m.layers.length} ≠ layerCount ${m.layerCount}`);
  m.layers.forEach((l, i) => {
    if (l.index !== i) errors.push(`materials: layer ${l.id} index ${l.index} ≠ ${i}`);
    if (!m.groups[l.group]?.includes(i)) errors.push(`materials: layer ${l.id} not in group ${l.group}`);
  });
  return { layers: m.layerCount, bytes };
}
