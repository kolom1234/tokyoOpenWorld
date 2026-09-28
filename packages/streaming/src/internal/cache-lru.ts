// Cache Storage 용량 상한(06 §7, 1.5 GB): URL별 바이트를 사용 순서(Map 삽입 순서)로 추적하고 초과분을 오래된 것부터 고른다.
// 세션 간 순서는 Cache.keys() 저장 순서(= 처음 저장한 순서)로 근사 — 적중 때 다시 쓰지 않는다(ADR-0023). 순수 자료구조.

export interface CacheLru {
  /** 사용(적중·저장) 기록 → 가장 최근으로. 반환 = 상한을 넘겨 지워야 할 URL(방금 쓴 것 제외, 오래된 순). */
  touch(url: string, bytes: number): string[];
  remove(url: string): void;
  /** 부팅 시 기존 항목(오래된 순). 이미 기록된 URL은 건너뛰고 기존 기록보다 오래된 쪽에 둔다. 반환 = 지울 URL. */
  seed(entries: ReadonlyArray<readonly [url: string, bytes: number]>): string[];
  readonly bytes: number;
  readonly size: number;
}

export function createCacheLru(maxBytes: number): CacheLru {
  let order = new Map<string, number>();
  let total = 0;

  const trim = (keep?: string): string[] => {
    const out: string[] = [];
    for (const [url, b] of order) {
      if (total <= maxBytes) break;
      if (url === keep) continue;
      order.delete(url);
      total -= b;
      out.push(url);
    }
    return out;
  };

  return {
    touch(url, bytes) {
      const prev = order.get(url);
      if (prev !== undefined) {
        order.delete(url);
        total -= prev;
      }
      order.set(url, bytes);
      total += bytes;
      return trim(url);
    },
    remove(url) {
      const prev = order.get(url);
      if (prev === undefined) return;
      order.delete(url);
      total -= prev;
    },
    seed(entries) {
      const older = new Map<string, number>();
      for (const [url, b] of entries) {
        if (order.has(url) || older.has(url)) continue;
        older.set(url, b);
        total += b;
      }
      order = new Map([...older, ...order]);
      return trim();
    },
    get bytes() {
      return total;
    },
    get size() {
      return order.size;
    },
  };
}
