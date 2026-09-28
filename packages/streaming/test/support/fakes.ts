// 테스트 대역: Cache Storage(Map), 스크립트된 fetch, /fixtures/world-mini 정적 HTTP 서버.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, normalize } from 'node:path';
import type { CacheLike, CacheStorageLike, FetchLike } from '../../src/api.ts';

export interface FakeCaches extends CacheStorageLike {
  readonly stores: Map<string, Map<string, ArrayBuffer>>;
}

export function createFakeCaches(): FakeCaches {
  const stores = new Map<string, Map<string, ArrayBuffer>>();
  const open = async (name: string): Promise<CacheLike> => {
    const m = stores.get(name) ?? new Map<string, ArrayBuffer>();
    stores.set(name, m);
    return {
      match: async (url) => {
        const b = m.get(url);
        return b ? new Response(b.slice(0), { headers: { 'content-length': String(b.byteLength) } }) : undefined;
      },
      put: async (url, res) => {
        const b = await res.arrayBuffer();
        m.delete(url); // 실제 Cache처럼 다시 쓰면 저장 순서 끝으로
        m.set(url, b);
      },
      delete: async (url) => m.delete(url),
      keys: async () => [...m.keys()],
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
}

/** 호출마다 다음 응답(상태 또는 throw)을 돌려주는 fetch. 'body'면 200 + 주어진 바이트. */
export function scriptedFetch(
  steps: Array<number | 'throw' | 'body' | ArrayBuffer>,
  body: ArrayBuffer,
): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const f = async (url: string, init?: { signal?: AbortSignal }) => {
    calls.push(url);
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'throw') throw new TypeError('network down');
    if (step === 'body') return new Response(body.slice(0), { status: 200 });
    if (step instanceof ArrayBuffer) return new Response(step, { status: 200 });
    return new Response(null, { status: step ?? 500 });
  };
  return Object.assign(f, { calls });
}

/** `<root>`를 `/fixtures/world-mini/*`로 서빙(apps/game vite 플러그인과 같은 경로). */
export async function serveWorldMini(root: string): Promise<{ baseUrl: string; server: Server; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    hits.push(path);
    const prefix = '/fixtures/world-mini/';
    const file = join(root, normalize(path.slice(prefix.length)));
    if (!path.startsWith(prefix) || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/fixtures/world-mini`, server, hits };
}
