// 녹음 에셋(빌드 shared/audio — R2 공유 에셋, 지연 로딩): manifest 1회 + 파일별 decodeAudioData는 처음 필요할 때(첫 로드 예산 밖).
import type { Logger } from '@sanpo/core';
import type { AudioManifest, AudioManifestEntry } from '@sanpo/tile-format';

export interface AssetStore {
  readonly manifest: AudioManifest | null;
  entry(id: string): AudioManifestEntry | undefined;
  /** 디코드된 버퍼(아직이면 undefined + 불러오기 시작). */
  buffer(id: string): AudioBuffer | undefined;
  loaded(): number;
  files(): number;
}

export function createAssetStore(o: {
  ctx: BaseAudioContext;
  manifestUrl?: string;
  fetchFn: (url: string) => Promise<Response>;
  log: Logger;
}): AssetStore {
  let manifest: AudioManifest | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const pending = new Set<string>();
  const failed = new Set<string>();
  const base = o.manifestUrl ? o.manifestUrl.slice(0, o.manifestUrl.lastIndexOf('/') + 1) : '';
  if (o.manifestUrl)
    o.fetchFn(o.manifestUrl)
      .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m) => {
        if (m.schema !== 1) throw new Error(`manifest schema ${String(m.schema)}`);
        manifest = m;
        o.log.info(`manifest ${m.hash}: ${Object.keys(m.files).length} files`);
      })
      .catch((e: unknown) => o.log.warn('audio manifest unavailable — synth only', e));
  const load = (id: string, e: AudioManifestEntry): void => {
    pending.add(id);
    o.fetchFn(base + e.file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((ab) => o.ctx.decodeAudioData(ab))
      .then((b) => buffers.set(id, b))
      .catch((err: unknown) => {
        failed.add(id);
        o.log.warn(`audio ${id} failed`, err);
      })
      .finally(() => pending.delete(id));
  };
  return {
    get manifest() {
      return manifest;
    },
    entry: (id) => manifest?.files[id],
    buffer(id) {
      const b = buffers.get(id);
      if (b) return b;
      const e = manifest?.files[id];
      if (e && !pending.has(id) && !failed.has(id)) load(id, e);
      return undefined;
    },
    loaded: () => buffers.size,
    files: () => (manifest ? Object.keys(manifest.files).length : 0),
  };
}
