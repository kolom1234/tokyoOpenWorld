// 렌더 스모크(M01-T06): `?world=mini&debug=1&backend=webgl` 시작 화면에 건물이 보이는지(하늘이 아닌 픽셀 비율),
// 원점 재설정 강제 테스트(+4096 m → 복귀) 전후 화면이 픽셀 단위로 같은지(떨림·누적 오차 없음). 시계는 `?time=`으로 고정(M03-T03 — 태양이 움직이면 하늘이 바뀜).
// 캡처는 안정(`data-settled` — 첫 품질 티어·스트리밍·HLOD 페이드) 뒤 게임 루프 직후 캔버스(game.ts). 스크린샷은 test-results/screenshots/. see docs/14-testing-perf.md §1
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { captureCanvas, OVERLAY, waitSettled } from './game.ts';

const SHOTS = join(import.meta.dirname, '../../test-results/screenshots');
// SwiftShader 병렬(워커 2)에서 부트 → 안정까지 수십 초. 판정은 상태 대기, 이 값은 안전망.
test.setTimeout(180_000);

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface PixelStats {
  /** 좌상단 픽셀(하늘) 색과 채널 차 > 24인 픽셀 비율. */
  nonSky: number;
  sky: [number, number, number];
}

/** PNG를 브라우저에서 디코드해 영역(0–1 비율)의 하늘 아닌 픽셀 비율을 잰다(추가 의존성 없이). */
async function nonSkyRatio(page: Page, png: Buffer, r: Region): Promise<PixelStats> {
  return page.evaluate(
    async ({ b64, r }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('2d context');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const sky: [number, number, number] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
      let hit = 0;
      let n = 0;
      for (let y = Math.floor(r.y0 * img.height); y < r.y1 * img.height; y++) {
        for (let x = Math.floor(r.x0 * img.width); x < r.x1 * img.width; x++) {
          const i = (y * img.width + x) * 4;
          const d = Math.max(...[0, 1, 2].map((k) => Math.abs((data[i + k] ?? 0) - (sky[k] ?? 0))));
          if (d > 24) hit++;
          n++;
        }
      }
      return { nonSky: hit / n, sky };
    },
    { b64: png.toString('base64'), r },
  );
}

test('start view renders Scramble Square and surrounding buildings (WebGL2 fallback)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00&mode=freecam');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-backend', 'webgl2', { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-rendered-cells', '4', { timeout: 60_000 });
  const overlay = page.locator(OVERLAY);
  await expect(overlay).toHaveAttribute('data-cells', '4');
  await expect(overlay).toHaveAttribute('data-depth', /^(reversed-z|logarithmic)$/);
  await waitSettled(page);
  test.info().annotations.push({ type: 'overlay', description: (await overlay.textContent()) ?? '' });
  const png = await captureCanvas(page);
  writeFileSync(join(SHOTS, 'start.png'), png);
  // 화면 중앙 세로 띠(타워가 서 있는 곳, 위 15–50%)는 대부분 건물이어야 한다.
  const tower = await nonSkyRatio(page, png, { x0: 0.45, y0: 0.15, x1: 0.55, y1: 0.5 });
  expect(tower.nonSky).toBeGreaterThan(0.6);
  // 화면 아래 1/3은 대부분 건물·지면. world-mini는 512 m 사방뿐이라 수평선 근처에 월드 끝(하늘)이 일부 보인다.
  const ground = await nonSkyRatio(page, png, { x0: 0, y0: 0.67, x1: 1, y1: 1 });
  expect(ground.nonSky).toBeGreaterThan(0.6);
  // 좌상단 모서리 띠는 하늘.
  const sky = await nonSkyRatio(page, png, { x0: 0, y0: 0, x1: 0.2, y1: 0.1 });
  expect(sky.nonSky).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

/** 원점 재설정 테스트 뷰포트: 부하가 있는 러너(SwiftShader 병렬)에서도 재설정 프레임이 제시간에 그려지게 ¼ 픽셀. */
const REBASE_VIEW = { width: 640, height: 360 };
/** 허용 z-파이팅 픽셀(해상도 무관 절대값). */
const Z_FIGHT_PX = 184;

test.describe('origin rebase', () => {
  test.use({ viewport: REBASE_VIEW });

  test('forced origin rebase (+4096 m and back) leaves the view pixel-identical (≤ 0.02% z-fight)', async ({
    page,
  }) => {
    await page.goto('/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00&mode=freecam');
    await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', '4', { timeout: 60_000 });
    const overlay = page.locator(OVERLAY);
    // 안정(HLOD 페이드·스트리밍 0·첫 품질 티어) 뒤에 비교 — 부하가 있으면 캡처가 페이드·재적재·티어 재구성 도중에 걸려 가끔 실패했다(M03 보강 4, M05 결정 0).
    await waitSettled(page);
    await expect(overlay).toHaveAttribute('data-rebases', '0');
    const cells = await overlay.getAttribute('data-cells');
    const before = await captureCanvas(page);

    await page.evaluate(async () => {
      const d = (globalThis as unknown as { __SANPO_DEBUG__: { rebaseTest(): Promise<void> } }).__SANPO_DEBUG__;
      await d.rebaseTest();
    });
    await expect(overlay).toHaveAttribute('data-rebases', '2');
    // 4 km 밖에 있던 동안 해제된 셀이 돌아오고 HLOD 페이드가 끝날 때까지.
    await expect(overlay).toHaveAttribute('data-cells', cells ?? '', { timeout: 60_000 });
    await waitSettled(page);
    const after = await captureCanvas(page);
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, 'after-rebase.png'), after);
    const diff = await page.evaluate(
      async ({ a, b }) => {
        const load = async (s: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${s}`;
          await img.decode();
          const c = new OffscreenCanvas(img.width, img.height);
          const ctx = c.getContext('2d');
          if (ctx === null) throw new Error('2d context');
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height).data;
        };
        const [pa, pb] = [await load(a), await load(b)];
        let changed = 0;
        for (let i = 0; i < pa.length; i += 4) {
          if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) changed++;
        }
        return changed;
      },
      { a: before.toString('base64'), b: after.toString('base64') },
    );
    // 떨림·누적 오차는 화면 전체를 움직인다. 허용 184 px(= 1280×720의 0.02 %)은 재설정 뒤 셀 그리기 순서가 바뀌어 겹친 면(PLATEAU 동일 평면 중복)의
    // z-파이팅 승자가 바뀌는 몇십 픽셀(M03-T04 이후, 1280×720 ≈ 70 px, 640×360 48–60 px — 면적이 아니라 경계선 길이에 비례해 해상도를 줄여도 거의 그대로).
    expect(diff).toBeLessThanOrEqual(Z_FIGHT_PX);
  });
});
