// CLI 공개 운영(M11-T06, cli.ts 400줄 제한으로 분리): `current --env dev|prod [--build-id <id>]` — 활성 빌드 포인터 보기/바꾸기(롤백 = 직전 buildId로, 파일 재업로드 없음).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Logger } from '@sanpo/core';
import { FORMAT_VERSION } from '@sanpo/tile-format';
import { readPointer, setCurrentBuild } from './stages/publish/current.ts';
import { createClients, type PublishEnv, readTargets } from './stages/publish/targets.ts';

export async function current(ctx: { repoRoot: string; log: Logger }, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { env: { type: 'string', default: 'dev' }, 'build-id': { type: 'string' } },
  });
  const target = readTargets(join(ctx.repoRoot, 'apps/worker/wrangler.jsonc'))[values.env as PublishEnv];
  if (!target) throw new Error(`--env ${values.env}: dev | prod`);
  const clog = ctx.log.child('current');
  const { kv } = await createClients(target, process.env, clog);
  const id = values['build-id'];
  if (!id) {
    const s = await readPointer(kv, FORMAT_VERSION);
    clog.info(`${target.env}: current ${s.current ?? '(none)'}; published ${s.builds.join(', ') || '(none)'}`);
    return;
  }
  const t0 = performance.now();
  await setCurrentBuild(kv, FORMAT_VERSION, id, clog);
  clog.info(
    `${target.env}: pointer set in ${Math.round(performance.now() - t0)} ms (edge: /api/world/current max-age 60 s)`,
  );
}
