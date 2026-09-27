// 정적 에셋 한도 게이트(`pnpm check:assets [dir]`): 파일당 25 MiB, 파일 수 20,000(Workers Free). see docs/13-deployment.md §2
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listFiles, report } from './lib/files.ts';

/** Cloudflare Workers Static Assets 한도(2026-09 기준, docs/13-deployment.md §2). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILE_COUNT = 20_000;
const DEFAULT_DIR = 'apps/game/dist';

const repoRoot = resolve(import.meta.dirname, '..');
const dir = process.argv[2] ?? DEFAULT_DIR;
const files = listFiles(repoRoot, dir);
let failures = 0;
if (files.length === 0) {
  report('error', `${dir} is empty or missing — run \`pnpm build\` first`);
  failures++;
}
if (files.length > MAX_FILE_COUNT) {
  report('error', `${dir} has ${files.length} files (max ${MAX_FILE_COUNT})`);
  failures++;
}
for (const path of files) {
  const bytes = statSync(join(repoRoot, path)).size;
  if (bytes > MAX_FILE_BYTES) {
    report('error', `${(bytes / 1024 / 1024).toFixed(1)} MiB exceeds 25 MiB — world data belongs in R2`, path);
    failures++;
  }
}
process.stdout.write(`check-asset-size: ${files.length} file(s) in ${dir}, ${failures === 0 ? 'ok' : 'FAILED'}\n`);
process.exitCode = failures === 0 ? 0 : 1;
