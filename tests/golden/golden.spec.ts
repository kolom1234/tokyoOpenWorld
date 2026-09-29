// 골든뷰 캡처·비교(M03-T10, 14-testing-perf §3): 실제 GPU Chrome(2560×1440)에서 `?view=<id>` → `#app[data-golden=ready]` → 캔버스 캡처.
// 환경 변수: GOLDEN_LABEL(출력 폴더, 기본 'latest') · GOLDEN_VIEWS(쉼표 id, 기본 core 4장, 'all' = 전부) · GOLDEN_SAVE(docs/screenshots/<SAVE>/에 JPEG 저장)
//            GOLDEN_REPEAT=1(같은 뷰를 새 컨텍스트로 두 번 → SSIM ≥ 0.99) · GOLDEN_WORLD(local | api, 기본 local) · GOLDEN_BOOT=1(스폰 부팅 첫 로딩 MB 측정)
// 출력: test-results/golden/<LABEL>/<id>.png(원본) + metrics.json. see tests/golden/README.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { lumaOf, ssimGray } from './ssim.ts';

interface View {
  id: string;
  core: boolean;
}
const ROOT = join(import.meta.dirname, '../..');
const VIEWS = (JSON.parse(readFileSync(join(import.meta.dirname, 'views.json'), 'utf8')) as { views: View[] }).views;
const LABEL = process.env.GOLDEN_LABEL ?? 'latest';
const OUT = join(ROOT, 'test-results/golden', LABEL);
const SAVE = process.env.GOLDEN_SAVE;
const WORLD = process.env.GOLDEN_WORLD === 'api' ? '' : 'world=local&';
const EXTRA_QUERY = process.env.GOLDEN_QUERY ? `&${process.env.GOLDEN_QUERY}` : '';
const SELECTED = ((): View[] => {
  const w = process.env.GOLDEN_VIEWS;
  if (w === 'all') return VIEWS;
  if (w) return VIEWS.filter((v) => w.split(',').includes(v.id));
  return VIEWS.filter((v) => v.core);
})();
/** 오버레이·상태 화면을 숨긴 캔버스만. */
const HIDE_UI = 'body > :not(#view) { visibility: hidden !important; }';
/** 저장용 JPEG(커밋 크기 절약): 1920×1080, 품질 0.85. 비교는 원본 PNG로. */
const SAVE_WIDTH = 1920;
const SAVE_QUALITY = 0.85;
const SSIM_MIN = 0.99;

const metrics: Record<string, unknown> = {};

interface Capture {
  png: Buffer;
  metrics: unknown;
  errors: string[];
}

async function capture(page: Page, id: string): Promise<Capture> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  let bytes = 0;
  const pending: Promise<void>[] = [];
  page.on('requestfinished', (r) => {
    pending.push(
      r.sizes().then((s) => {
        bytes += s.responseBodySize + s.responseHeadersSize;
      }),
    );
  });
  const t0 = Date.now();
  await page.goto(`/?${WORLD}view=${id}${EXTRA_QUERY}`);
  await expect(page.locator('#app')).toHaveAttribute('data-golden', 'ready', { timeout: 240_000 });
  await page.addStyleTag({ content: HIDE_UI });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // GPU 타이머가 켜져 있으면 안정 상태 표본(≈ 2 s 창)이 쌓이게 기다린 뒤 잰다.
  if (EXTRA_QUERY.includes('gpuTiming=1')) await page.waitForTimeout(3000);
  const png = await page.screenshot();
  const m = await page.evaluate(() => {
    const g = (globalThis as { __SANPO_GOLDEN__?: { render(): unknown; metrics?(): unknown } }).__SANPO_GOLDEN__;
    return { render: g?.render(), extra: g?.metrics?.() };
  });
  await Promise.all(pending);
  return { png, errors, metrics: { ...m, readyS: (Date.now() - t0) / 1000, transferMB: bytes / 1e6 } };
}

/** 원본 PNG → 저장용 JPEG(브라우저 캔버스 인코더, 추가 의존성 없음). */
async function toJpeg(page: Page, png: Buffer): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ src, width, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const h = Math.round((img.height * width) / img.width);
      const c = new OffscreenCanvas(width, h);
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('2d context');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, h);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { src: png.toString('base64'), width: SAVE_WIDTH, quality: SAVE_QUALITY },
  );
  return Buffer.from(b64, 'base64');
}

/** PNG 두 장 → 휘도 SSIM(브라우저에서 디코드, Node에서 계산). */
async function ssimOf(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const decode = (png: Buffer) =>
    page.evaluate(async (src) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('2d context');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return { w: img.width, h: img.height, rgba: btoa(s) };
    }, png.toString('base64'));
  const [da, db] = [await decode(a), await decode(b)];
  const la = lumaOf(Buffer.from(da.rgba, 'base64'));
  const lb = lumaOf(Buffer.from(db.rgba, 'base64'));
  return ssimGray(la, lb, da.w, da.h);
}

async function freshPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(() => writeFileSync(join(OUT, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`));

for (const v of SELECTED) {
  test(`golden ${v.id}`, async ({ browser }) => {
    const page = await freshPage(browser);
    const a = await capture(page, v.id);
    writeFileSync(join(OUT, `${v.id}.png`), a.png);
    if (SAVE) {
      const dir = join(ROOT, 'docs/screenshots', SAVE);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${v.id}.jpg`), await toJpeg(page, a.png));
    }
    const entry: Record<string, unknown> = { first: a.metrics, errors: a.errors };
    const baseline = join(ROOT, 'test-results/golden/baseline', `${v.id}.png`);
    if (existsSync(baseline)) entry.ssimVsBaseline = await ssimOf(page, readFileSync(baseline), a.png);
    if (process.env.GOLDEN_REPEAT === '1') {
      const page2 = await freshPage(browser);
      const b = await capture(page2, v.id);
      writeFileSync(join(OUT, `${v.id}.repeat.png`), b.png);
      const ssim = await ssimOf(page, a.png, b.png);
      entry.repeat = { ssim, metrics: b.metrics };
      await page2.context().close();
      expect(ssim).toBeGreaterThanOrEqual(SSIM_MIN);
    }
    metrics[v.id] = entry;
    await page.context().close();
    expect(a.errors).toEqual([]);
  });
}

/** 스폰(기본 부팅) 첫 표시까지 받은 바이트(14 §2 초기 다운로드 ≤ 60 MB). 새 컨텍스트 = 캐시 없음. */
test('boot transfer to first display', async ({ browser }) => {
  test.skip(process.env.GOLDEN_BOOT !== '1', 'GOLDEN_BOOT=1일 때만');
  const page = await freshPage(browser);
  const bytes: Record<string, number> = { world: 0, materials: 0, other: 0 };
  const pending: Promise<void>[] = [];
  page.on('requestfinished', (r) => {
    const url = r.url();
    const kind = /\/materials\//.test(url) ? 'materials' : /\/(local-world|world)\//.test(url) ? 'world' : 'other';
    pending.push(
      r.sizes().then((s) => {
        bytes[kind] = (bytes[kind] ?? 0) + s.responseBodySize + s.responseHeadersSize;
      }),
    );
  });
  const t0 = Date.now();
  await page.goto(`/?${WORLD.replace(/&$/, '')}`);
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', /[1-9]/, { timeout: 120_000 });
  const firstDisplayS = (Date.now() - t0) / 1000;
  await Promise.all(pending);
  const mb = Object.fromEntries(Object.entries(bytes).map(([k, v]) => [`${k}MB`, v / 1e6]));
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) / 1e6;
  metrics.boot = { firstDisplayS, transferMB: total, ...mb };
  await page.context().close();
});
