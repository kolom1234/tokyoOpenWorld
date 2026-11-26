// L1 원경 나무(M12-T07, S6 — ADR-0112): 자식 L0 셀 16개의 trees.inst를 L1 원점 기준으로 합친다(관목 제외 — 원경에서 안 보인다).
// 렌더 TreeField는 L1 나무를 64 m 블록으로 나눠, 그 자리 L0 셀 나무가 들어오면 그 블록만 숨긴다(두 번 그리지 않게). 05 §4: trees.inst levels [0, 1].
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type CellKey, unpackCellKey } from '@sanpo/core';
import { parseTrees, readTkc, TREE_SPECIES, type TreeRecord, treeRecordAt, writeTrees } from '@sanpo/tile-format';

const L0_M = 256;
const L1_M = 1024;

/** 빌드 폴더의 자식 L0 TKC → L1 trees.inst(없으면 null). sources = 자식 섹션 출처 합집합. */
export function l1Trees(outDir: string, key: CellKey): { data: Uint8Array; sources: string[]; count: number } | null {
  const { level, ix, iz } = unpackCellKey(key);
  if (level !== 1) return null;
  const recs: TreeRecord[] = [];
  const sources = new Set<string>();
  for (let dz = 0; dz < 4; dz++) {
    for (let dx = 0; dx < 4; dx++) {
      const [cx, cz] = [ix * 4 + dx, iz * 4 + dz];
      const file = join(outDir, 'L0', String(cx), `${cz}.tkc`);
      if (!existsSync(file)) continue;
      const tkc = readTkc(new Uint8Array(readFileSync(file)));
      if (!tkc.ok) continue;
      const sec = tkc.value.section('trees.inst');
      if (!sec) continue;
      for (const s of tkc.value.entry('trees.inst')?.sources ?? []) sources.add(s);
      const batch = parseTrees(new Uint8Array(gunzipSync(sec)));
      if (!batch.ok) continue;
      const [ox, oz] = [cx * L0_M - ix * L1_M, cz * L0_M - iz * L1_M];
      for (let i = 0; i < batch.value.count; i++) {
        const r = treeRecordAt(batch.value, i);
        if (r.species === TREE_SPECIES.shrub) continue;
        recs.push({ ...r, x: r.x + ox, z: r.z + oz });
      }
    }
  }
  if (recs.length === 0) return null;
  // 섹션 바이트는 만드는 쪽이 gzip(bin+gzip — props-cell과 같다).
  return {
    data: new Uint8Array(gzipSync(writeTrees(recs), { level: 9 })),
    sources: [...sources].sort(),
    count: recs.length,
  };
}
