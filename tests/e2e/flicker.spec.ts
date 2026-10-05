// 정지 카메라 떨림(M03 보강): 카메라가 멈춰 있으면 TAAU가 수렴해 연속 프레임이 거의 같아야 한다.
// 나무는 끈다(`trees=0` — 바람 흔들림은 실제 움직임이라 TAA 떨림 판정을 흐린다, M05-T04).
// CI(SwiftShader)는 기본으로 후처리를 끄므로 `?forcePost=1`로 GTAO + TAAU 체인을 켜고(480×270 — ≈ 10 FPS), 그림자·동적 해상도는 끈다.
// 게임 루프 직후(같은 프레임) 캔버스를 복사해 연속 8프레임 휘도 차를 잰다.
// 기준(로컬 SwiftShader, 역-Z GTAO 패치 ADR-0040 뒤): 고정 노이즈 + 블러(현재) 평균 |Δ| 0.095–0.105·>4 단계 0.23–0.32 %,
// GTAO 시간 노이즈 + 블러 없음(ADR-0038 수정 전) 0.153·0.62 %, 시간 노이즈 + 블러 0.135·0.46 %, TAA 끔 0.001. see docs/14-testing-perf.md §1
import { expect, type Page, test } from '@playwright/test';

const HIDE_UI = 'body > :not(#view) { visibility: hidden !important; }';
const QUERY =
  '/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00&mode=freecam&forcePost=1&quality=medium&dynres=0&shadows=0&trees=0&crowd=0';
/** TAAU 수렴(현재 프레임 가중 0.025) 대기 프레임. */
const WARMUP_FRAMES = 40;
const CAPTURE_FRAMES = 8;
/** 중앙값 임계(현재 값보다 ≈ 20–25 % 크고 두 회귀 변형보다 작게). */
const MAX_MEAN_ABS = 0.125;
const MAX_PCT_OVER4 = 0.4;
/** 화면 평균 휘도 변화(자동 노출·전역 깜빡임). */
const MAX_GLOBAL_DELTA = 0.1;

test.use({ viewport: { width: 480, height: 270 } });
// 병렬 e2e(SwiftShader CPU 경합)에서 후처리 체인이 1–3 FPS까지 떨어진다 → 여유 있게.
test.setTimeout(180_000);

interface FramePair {
  meanAbs: number;
  pctOver4: number;
  globalDelta: number;
  /** 뒤 프레임 평균 휘도(0–255). */
  frameMean: number;
}

/** 연속 n프레임 캡처 → 이웃 프레임 쌍의 휘도 차 통계. */
function captureStatic(page: Page, frames: number): Promise<FramePair[]> {
  return page.evaluate(async (n): Promise<FramePair[]> => {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    // rAF를 rAF 밖(작업)에서 등록 → 매 프레임 게임 루프 콜백(렌더) 뒤에 실행 → 표시 전 드로잉 버퍼를 복사.
    await new Promise((r) => setTimeout(r, 0));
    const frames: OffscreenCanvas[] = [];
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const oc = new OffscreenCanvas(canvas.width, canvas.height);
        oc.getContext('2d')?.drawImage(canvas, 0, 0);
        frames.push(oc);
        if (frames.length >= n) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const lum = frames.map((oc) => {
      const d = (oc.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, oc.width, oc.height).data;
      const y = new Float32Array(d.length / 4);
      for (let i = 0, j = 0; i < d.length; i += 4, j++)
        y[j] = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
      return y;
    });
    const out: FramePair[] = [];
    for (let f = 1; f < lum.length; f++) {
      const a = lum[f] as Float32Array;
      const b = lum[f - 1] as Float32Array;
      let sum = 0;
      let over = 0;
      let ga = 0;
      let gb = 0;
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
        sum += d;
        if (d > 4) over++;
        ga += a[i] ?? 0;
        gb += b[i] ?? 0;
      }
      out.push({
        meanAbs: sum / a.length,
        pctOver4: (100 * over) / a.length,
        globalDelta: Math.abs(ga - gb) / a.length,
        frameMean: ga / a.length,
      });
    }
    return out;
  }, frames);
}

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? Number.NaN;

test('static camera: consecutive frames are stable with GTAO + TAAU (no jitter shimmer)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(QUERY);
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', '4', { timeout: 60_000 });
  await page.addStyleTag({ content: HIDE_UI });
  const overlay = page.locator('.debug-overlay');
  const f0 = Number(await overlay.getAttribute('data-frames'));
  await expect
    .poll(async () => Number(await overlay.getAttribute('data-frames')), { timeout: 120_000 })
    .toBeGreaterThanOrEqual(f0 + WARMUP_FRAMES);

  const pairs = await captureStatic(page, CAPTURE_FRAMES);

  const meanAbs = median(pairs.map((p) => p.meanAbs));
  const pctOver4 = median(pairs.map((p) => p.pctOver4));
  test.info().annotations.push({ type: 'flicker', description: JSON.stringify({ meanAbs, pctOver4, pairs }) });
  // 캡처가 실제 화면을 담았는지(빈 캔버스면 차이가 0이라 통과해 버린다) — 프레임 평균 휘도.
  expect(pairs[0]?.frameMean ?? 0).toBeGreaterThan(20);
  expect(meanAbs).toBeLessThanOrEqual(MAX_MEAN_ABS);
  expect(pctOver4).toBeLessThanOrEqual(MAX_PCT_OVER4);
  expect(Math.max(...pairs.map((p) => p.globalDelta))).toBeLessThanOrEqual(MAX_GLOBAL_DELTA);
  expect(errors).toEqual([]);
});
