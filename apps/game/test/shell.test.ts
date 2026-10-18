// M10-T01 셸 배선: 설정 키 → 입력 바인딩(패드 유지), 설정 적용 대상, 로딩 단계 매핑, 빠른 이동 착지·생략.
import { DEFAULT_BINDINGS } from '@sanpo/input';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, REBIND_ACTIONS } from '@sanpo/ui';
import { describe, expect, it } from 'vitest';
import { arrived, fastTravel } from '../src/shell/fast-travel.ts';
import { loadingOfBoot, loadingOfWorld } from '../src/shell/loading.ts';
import { applySettings, bindingsWithKeys, loadSettings, mixOf, SETTINGS_KEY } from '../src/shell/settings.ts';

describe('settings → services', () => {
  it('UI default keys match the input default keyboard bindings', () => {
    for (const a of REBIND_ACTIONS) {
      const codes = Object.values(DEFAULT_BINDINGS).flatMap((ctx) =>
        ((ctx as Record<string, { device: string; code?: string }[]>)[a] ?? [])
          .filter((b) => b.device === 'key')
          .map((b) => b.code),
      );
      expect(codes.length, a).toBeGreaterThan(0);
      expect(codes, a).toContain(DEFAULT_KEYS[a]);
    }
  });
  it('rebinding replaces only keyboard keys, keeps gamepad bindings', () => {
    const m = bindingsWithKeys({ interact: 'KeyJ' });
    expect(m.walk.interact).toEqual([
      { device: 'key', code: 'KeyJ' },
      { device: 'padButton', button: 2 },
    ]);
    expect(m.vehicle.interact?.[0]).toEqual({ device: 'key', code: 'KeyJ' });
    expect(DEFAULT_BINDINGS.walk.interact?.[0]).toEqual({ device: 'key', code: 'KeyF' });
  });
  it('applies quality, fov, sensitivity, motion, invert, bindings and mix', () => {
    const calls: string[] = [];
    const t = {
      render: { setQuality: (q: string) => calls.push(`q:${q}`) },
      traversal: { configure: (p: unknown) => calls.push(`c:${JSON.stringify(p)}`) },
      input: { setBindings: () => calls.push('bind'), setAxisScale: (a: string, k: number) => calls.push(`${a}:${k}`) },
      audio: () => ({ setMix: (m: unknown) => calls.push(`mix:${JSON.stringify(m)}`) }),
      fixedQuality: false,
      fixedFov: false,
    };
    const s = { ...DEFAULT_SETTINGS, quality: 'low' as const, reduceMotion: true, invertY: true, muted: true };
    applySettings(t as never, s);
    expect(calls).toContain('q:low');
    expect(calls).toContain('lookY:-1');
    expect(calls).toContain('bind');
    expect(calls.find((c) => c.startsWith('c:'))).toContain('"motionEffects":false');
    expect(calls.find((c) => c.startsWith('c:'))).toContain('"headBob":false');
    expect(mixOf(s).master).toBe(0);
    calls.length = 0;
    applySettings(t as never, { ...s, fovDeg: 80 }, s);
    expect(calls.some((c) => c.startsWith('q:') || c === 'bind' || c.startsWith('mix:'))).toBe(false);
  });
  it('loads saved settings, falls back to the browser language', () => {
    const store = (v: string | null) => ({ getItem: (k: string) => (k === SETTINGS_KEY ? v : null) });
    expect(loadSettings(store(JSON.stringify({ lang: 'en', fovDeg: 90 })), ['ko']).fovDeg).toBe(90);
    expect(loadSettings(store(null), ['ja-JP']).lang).toBe('ja');
    expect(loadSettings(store('{broken'), ['ko']).lang).toBe('ko');
  });
});

describe('loading model', () => {
  it('maps world status and boot progress to stages', () => {
    expect(loadingOfWorld({ kind: 'error', detail: 'x' })).toEqual({ stage: 'error', error: 'x' });
    const b = { precompile: { stage: 'materials' as const, done: 5, total: 10 }, done: false };
    expect(loadingOfBoot(b, 0)).toMatchObject({ stage: 'shaders', detail: { params: { done: 5, total: 10 } } });
    const c = { precompile: { stage: 'cells' as const, done: 0, total: 1 }, spawn: [1, 2, 3, 4], done: false };
    expect(loadingOfBoot(c, 2).progress).toBeCloseTo(0.775, 3);
    expect(loadingOfBoot({ ...c, done: true }, 4).stage).toBe('ready');
  });
});

describe('fast travel', () => {
  const tr = (pos: { x: number; y: number; z: number }) => {
    const t = {
      mode: 'walk' as string,
      player: { posWF: { ...pos }, velWF: { x: 0, y: 0, z: 0 } },
      hud: {} as { groundLoading?: boolean },
      requested: [] as unknown[],
      request(m: string, p: { posWF: { x: number; y: number; z: number } }) {
        t.requested.push(p);
        t.mode = m;
        Object.assign(t.player.posWF, p.posWF);
        return true;
      },
      teleport: () => Promise.resolve(),
    };
    return t;
  };
  it('skips when already there, otherwise re-enters walk and waits for a settled landing', async () => {
    const doc = {} as Document;
    let clock = 0;
    const deps = (t: ReturnType<typeof tr>) => ({
      doc,
      traversal: t as never,
      physics: () => undefined,
      sleep: (ms: number) => {
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    });
    const near = tr({ x: 0, y: 0, z: 0 });
    expect(await fastTravel(deps(near), { posWF: { x: 5, y: 0, z: 5 }, yawRad: 0 })).toBe(true);
    expect(near.requested).toHaveLength(0);
    const far = tr({ x: 0, y: 0, z: 0 });
    expect(await fastTravel(deps(far), { posWF: { x: 200, y: 30, z: -1200 }, yawRad: 1 })).toBe(true);
    expect(far.requested).toHaveLength(1);
    expect(arrived(far as never, { x: 200, y: 30, z: -1200 })).toBe(true);
    far.hud.groundLoading = true;
    expect(arrived(far as never, { x: 200, y: 30, z: -1200 })).toBe(false);
  });
});

describe('place index (M10-T02)', () => {
  it('finds the smallest containing polygon in cell-local → WF and forgets evicted cells', async () => {
    const { createPlaceIndex, pointInPolygon } = await import('../src/shell/places.ts');
    const idx = createPlaceIndex();
    const big = {
      code: 'A',
      nameI18n: { ja: 'A', en: 'A', ko: 'A' },
      polygonLocal: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ] as [number, number][],
    };
    const small = {
      code: 'B',
      nameI18n: { ja: 'B', en: 'B', ko: 'B' },
      polygonLocal: [
        [40, 40],
        [60, 40],
        [60, 60],
        [40, 60],
      ] as [number, number][],
    };
    idx.add(7, 256, -256, { placeNames: [big, small] });
    expect(idx.at(256 + 50, -256 + 50)?.en).toBe('B');
    expect(idx.at(256 + 10, -256 + 10)?.en).toBe('A');
    expect(idx.at(0, 0)).toBeNull();
    idx.remove(7);
    expect(idx.at(256 + 50, -256 + 50)).toBeNull();
    expect(pointInPolygon(Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]), 5, 5)).toBe(true);
  });
});

describe('field guide (M10-T04)', () => {
  it('builds 20 POIs with 3-language names from Wikidata rules', async () => {
    const { poiEntries, resolveName } = await import('../src/shell/pois.ts');
    const list = poiEntries();
    expect(list).toHaveLength(20);
    for (const e of list) for (const l of ['ja', 'en', 'ko'] as const) expect(e.name[l], `${e.id}:${l}`).toBeTruthy();
    const cat = list.find((e) => e.id === 'cat-street');
    expect(cat?.name.ja).toBe('キャットストリート');
    const wd = { id: 'x', labels: { ja: 'J', en: 'E' }, aliases: { ja: ['別名 (説明)'] }, lat: 0, lon: 0 };
    expect(resolveName('alias:別名 (説明)', 'ja', wd)).toBe('別名');
    expect(resolveName('alias:nope', 'ja', wd)).toBe('J');
    expect(resolveName('derived:가나', 'ko', wd)).toBe('가나');
  });
});

describe('photo mode (M10-T05)', () => {
  it('maps focal length to FOV and aperture to depth of field', async () => {
    const { dofOf, fovOfFocal } = await import('../src/shell/photo.ts');
    expect(fovOfFocal(24)).toBeCloseTo(53.13, 1);
    expect(fovOfFocal(200)).toBeLessThan(7);
    expect(dofOf({ aperture: 22, focusM: 10 })).toBeNull();
    expect(dofOf({ aperture: 2, focusM: null })).toBeNull();
    const d = dofOf({ aperture: 2, focusM: 10 });
    expect(d?.focusM).toBe(10);
    expect(d?.rangeM).toBeCloseTo(2.5, 6);
    expect(d?.bokeh).toBeCloseTo(2, 6);
  });
});

describe('save (M10-T06)', () => {
  it('dataUrlToBlob decodes base64 without fetch (deploy CSP connect-src blocks data:)', async () => {
    const { dataUrlToBlob } = await import('../src/shell/save.ts');
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('CSP'))) as typeof fetch;
    try {
      const b = dataUrlToBlob('data:image/jpeg;base64,/9j/');
      expect(b?.type).toBe('image/jpeg');
      expect([...new Uint8Array(await (b as Blob).arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
      expect(dataUrlToBlob('data:text/plain,hi')).toBeNull();
      expect(dataUrlToBlob('data:image/png;base64,@@@')).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });
  it('export → import round-trips the collection through a store', async () => {
    const { applyCollection, blobToDataUrl, exportBlob, importFile } = await import('../src/shell/save.ts');
    const { createDiscovery } = await import('../src/shell/pois.ts');
    const { createTravelState } = await import('../src/shell/travel.ts');
    const { signal, DEFAULT_SETTINGS } = await import('@sanpo/ui');
    const mem = new Map<string, unknown>();
    const thumbsMem = new Map<string, Blob>();
    const store = {
      load: async () => (mem.get('save') as never) ?? null,
      write: async (s: unknown, t?: ReadonlyMap<string, Blob>) => {
        mem.set('save', s);
        for (const [k, v] of t ?? []) thumbsMem.set(k, v);
      },
      thumbs: async (ids: readonly string[]) =>
        new Map(ids.flatMap((id) => (thumbsMem.has(id) ? [[id, thumbsMem.get(id) as Blob]] : []))),
    };
    const thumb = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    expect(await blobToDataUrl(thumb)).toBe('data:image/jpeg;base64,/9j/');
    const photos: { id: string; thumb: Blob; url: string; atMs: number; poiId: string | null }[] = [];
    const photo = {
      photos: () => photos,
      restore: (l: { id: string; thumb: Blob; atMs: number; poiId: string | null }[]) => {
        for (const r of l) photos.push({ ...r, url: 'blob:x' });
      },
    };
    const save = {
      v: 2 as const,
      savedAt: 1,
      posWF: { x: 1, y: 2, z: 3 },
      yawRad: 0.5,
      mode: 'walk' as const,
      gameTimeMs: 10,
      discoveries: [{ id: 'meiji-jingu', atMs: 9, weather: 'rain', photoIds: ['p1'] }],
      unlocked: ['omotesando'],
      photos: [{ id: 'p1', atMs: 9, poiId: 'meiji-jingu' }],
      stats: { walkedM: 120 },
    };
    const settings = signal({ ...DEFAULT_SETTINGS, lang: 'ja' as const });
    photo.restore([{ id: 'p1', thumb, atMs: 9, poiId: 'meiji-jingu' }]);
    const parts = (doc: Document) => {
      const places = signal([] as never[]);
      const travel = createTravelState(places as never);
      return {
        discovery: createDiscovery(doc, signal([] as never[]) as never, () => {}),
        travel,
        photo: photo as never,
        settings,
        places,
      };
    };
    const a = parts({} as Document);
    const blob = await exportBlob(save, a, store);
    photos.length = 0;
    const x = await importFile(blob, store);
    expect(x.settings.lang).toBe('ja');
    const b = parts({} as Document);
    await applyCollection(x.save, b, store);
    expect(b.discovery.records().map((r) => r.id)).toEqual(['meiji-jingu']);
    expect(b.travel.isUnlocked('omotesando')).toBe(true);
    expect(b.travel.isUnlocked('poi:meiji-jingu')).toBe(true);
    expect(photos.map((p) => p.id)).toEqual(['p1']);
  });
});
