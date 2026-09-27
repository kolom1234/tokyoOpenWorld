// 엣지 캐시(`caches.default`) 접근. Workers 밖(Vitest·브라우저)에서는 undefined → 캐시 생략. see docs/13-deployment.md §4
/** Cache 중 사용하는 부분. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export function edgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}
