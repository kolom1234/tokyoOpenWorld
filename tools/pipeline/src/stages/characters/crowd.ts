// 군중 팩(M06-T01): 베이스 12종 LOD 메시 + 뼈 팔레트 텍스처 + KTX2 배열. TODO(M06-T01): 구현.
import type { Logger } from '@sanpo/core';
import type { Read } from './prepare.ts';
import type { Catalog } from './source.ts';

export async function buildCrowdPack(_repoRoot: string, _read: Read, _c: Catalog, log: Logger): Promise<void> {
  log.info('crowd pack: not implemented yet (M06-T01)');
}
