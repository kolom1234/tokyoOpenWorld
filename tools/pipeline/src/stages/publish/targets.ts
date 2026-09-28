// 퍼블리시 대상(env → R2 버킷·KV 네임스페이스)을 apps/worker/wrangler.jsonc에서 읽는다(바인딩 정의의 단일 출처).
// dev = env.staging(sanpo-world-dev), prod = top-level(sanpo-world-prod). 자격 증명은 환경 변수만. see docs/13-deployment.md §1–2, §7
import { readFileSync } from 'node:fs';
import type { Logger } from '@sanpo/core';
import {
  createApiUploader,
  createKvClient,
  createS3Uploader,
  type KvClient,
  resolveAccountId,
  type Uploader,
} from './uploaders.ts';

export type PublishEnv = 'dev' | 'prod';

export interface PublishTarget {
  env: PublishEnv;
  bucket: string;
  kvNamespaceId: string;
}

interface Bindings {
  r2_buckets?: { binding: string; bucket_name: string }[];
  kv_namespaces?: { binding: string; id: string }[];
}

/** JSONC → JSON: 문자열 밖의 `//`·블록 주석과 꼬리 쉼표 제거. */
export function stripJsonc(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function pick(b: Bindings, env: PublishEnv): PublishTarget {
  const bucket = b.r2_buckets?.find((x) => x.binding === 'WORLD')?.bucket_name;
  const kv = b.kv_namespaces?.find((x) => x.binding === 'CONFIG')?.id;
  if (!bucket || !kv) throw new Error(`wrangler.jsonc: ${env} WORLD/CONFIG bindings missing`);
  return { env, bucket, kvNamespaceId: kv };
}

export function readTargets(wranglerJsonc: string): Record<PublishEnv, PublishTarget> {
  const cfg = JSON.parse(stripJsonc(readFileSync(wranglerJsonc, 'utf8'))) as Bindings & {
    env?: { staging?: Bindings };
  };
  return { prod: pick(cfg, 'prod'), dev: pick(cfg.env?.staging ?? {}, 'dev') };
}

export interface Clients {
  uploader: Uploader;
  kv: KvClient;
  accountId: string;
}

/**
 * 업로더 선택: R2_ACCESS_KEY_ID·R2_SECRET_ACCESS_KEY가 있으면 `s3`(HEAD 검증), 없으면 CLOUDFLARE_API_TOKEN으로 `api`.
 * KV는 항상 API 토큰(wrangler 로그인과 같은 토큰).
 */
export async function createClients(
  t: PublishTarget,
  env: NodeJS.ProcessEnv,
  log: Logger,
  force?: 's3' | 'api',
): Promise<Clients> {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required (KV pointer, api uploader)');
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? (await resolveAccountId(token));
  const keys = env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY;
  const kind = force ?? (keys ? 's3' : 'api');
  if (kind === 's3' && !keys) throw new Error('--uploader s3 needs R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
  const uploader =
    kind === 's3'
      ? createS3Uploader({
          accountId,
          bucket: t.bucket,
          cred: { accessKeyId: env.R2_ACCESS_KEY_ID as string, secretAccessKey: env.R2_SECRET_ACCESS_KEY as string },
        })
      : createApiUploader({ accountId, bucket: t.bucket, token });
  log.info(`target ${t.env}: bucket ${t.bucket}, kv ${t.kvNamespaceId}, uploader ${uploader.name}`);
  return { uploader, kv: createKvClient({ accountId, namespaceId: t.kvNamespaceId, token }), accountId };
}
