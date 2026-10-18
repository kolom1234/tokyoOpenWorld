// 지도 데이터 소스(M10-T03): 월드 빌드 global/map.pmtiles(파일 전체 — 수 MB, 처음 필요할 때 한 번) → 타일 MVT 디코드 → UI MapTileData. WF → 메르카토르는 @sanpo/geo.
// 외부 지도 타일 서비스 없음. 파일이 없으면(world-mini 픽스처 등) state = missing.
import type { Vec3d } from '@sanpo/core';
import { wfToLonLat } from '@sanpo/geo';
import { decodeMvt, type PmtilesArchive, readPmtiles } from '@sanpo/tile-format';
import { type MapSource, type MapTileData, signal } from '@sanpo/ui';

/** WF → 웹 메르카토르 정규(0…1, y 아래). */
export function worldToMerc(p: Readonly<Vec3d>): { x: number; y: number } {
  const ll = wfToLonLat({ x: p.x, y: 0, z: p.z });
  const s = Math.sin((ll.lat * Math.PI) / 180);
  return { x: (ll.lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

export function createMapSource(fetchFn: (u: string) => Promise<Response> = (u) => fetch(u)): MapSource & {
  setBase(baseUrl: string): void;
} {
  const state = signal<'idle' | 'loading' | 'ready' | 'missing'>('idle');
  let base: string | undefined;
  let archive: PmtilesArchive | undefined;
  let wanted = false;
  const cache = new Map<string, Promise<MapTileData | null>>();
  const start = (): void => {
    if (!base || state.peek() !== 'idle') return;
    state.value = 'loading';
    fetchFn(`${base}/global/map.pmtiles`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`map.pmtiles ${r.status}`);
        archive = await readPmtiles(new Uint8Array(await r.arrayBuffer()));
        src.minZoom = archive.header.minZoom;
        src.maxZoom = archive.header.maxZoom;
        state.value = 'ready';
      })
      .catch(() => {
        state.value = 'missing';
      });
  };
  const src = {
    state,
    minZoom: 13,
    maxZoom: 16,
    setBase(b: string) {
      base = b;
      if (wanted) start();
    },
    load() {
      wanted = true;
      start();
    },
    tile(z: number, x: number, y: number): Promise<MapTileData | null> {
      const a = archive;
      if (!a) return Promise.resolve(null);
      const key = `${z}/${x}/${y}`;
      let p = cache.get(key);
      if (!p) {
        p = a.tile(z, x, y).then((bytes) => {
          if (!bytes) return null;
          const layers = decodeMvt(bytes);
          return {
            extent: layers[0]?.extent ?? 4096,
            features: layers.flatMap((l) =>
              l.features.map((f) => ({ layer: l.name, type: f.type, geometry: f.geometry, props: f.properties })),
            ),
          };
        });
        cache.set(key, p);
      }
      return p;
    },
  };
  return src;
}
