// M10 UI 셸 e2e: 샌드박스(렌더 없음)에서 키보드·게임패드 메뉴 이동·언어 즉시 전환, world-mini 메뉴 모드에서 타이틀 → 새 산책 → HUD → 일시정지(게임 입력 끔).
// 판정 = UI 상태(data-top·data-screen·포커스·입력 enabled)로 기다리고, 그림은 Node 쪽 PNG 분석(포커스 강조색·메뉴 어둡게). see docs/14-testing-perf.md §1
import { expect, type Page, test } from '@playwright/test';
import { STATE_TIMEOUT_MS, STATE_VIEW, waitFrames } from './game.ts';
import { decodePng, type RgbaImage } from './png.ts';

const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

/** 강조색(#f08a24 근처) 픽셀 수. */
function accentPixels(img: RgbaImage): number {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i] as number;
    const g = img.data[i + 1] as number;
    const b = img.data[i + 2] as number;
    if (r > 200 && g > 100 && g < 175 && b < 90) n++;
  }
  return n;
}

function meanLuma(img: RgbaImage): number {
  let s = 0;
  for (let i = 0; i < img.data.length; i += 4)
    s += 0.2126 * (img.data[i] as number) + 0.7152 * (img.data[i + 1] as number) + 0.0722 * (img.data[i + 2] as number);
  return s / (img.data.length / 4);
}

/** 가짜 게임패드(표준 매핑) — window.__pad.buttons[i] = true로 누른다. */
const PAD_STUB = () => {
  const pad = { buttons: Array.from({ length: 17 }, () => false), axes: [0, 0, 0, 0] };
  Object.assign(window, { __pad: pad });
  navigator.getGamepads = () =>
    [
      {
        connected: true,
        mapping: 'standard',
        index: 0,
        id: 'stub',
        axes: pad.axes,
        buttons: pad.buttons.map((p) => ({ pressed: p, value: p ? 1 : 0, touched: p })),
      },
    ] as unknown as (Gamepad | null)[];
};

async function padTap(page: Page, button: number): Promise<void> {
  await page.evaluate((b) => {
    (window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[b] = true;
  }, button);
  await page.waitForTimeout(80);
  await page.evaluate((b) => {
    (window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[b] = false;
  }, button);
  await page.waitForTimeout(80);
}

test('ui sandbox: keyboard + gamepad navigation, language switches instantly, focus is visible', async ({ page }) => {
  await page.addInitScript(PAD_STUB);
  await page.goto('/?ui-sandbox=1&screen=title&lang=ko');
  await expect(page.locator('body')).toHaveAttribute('data-ui-sandbox', 'ready');
  await expect.poll(() => focusedId(page)).toBe('title-continue');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedId(page)).toBe('title-new');
  const shot = decodePng(await page.screenshot());
  expect(accentPixels(shot), 'focused button outline').toBeGreaterThan(200);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen=settings]')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press('BracketRight');
  await expect(page.locator('#tab-general')).toHaveClass(/active/);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedId(page)).toBe('set-lang');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-screen=settings] h2')).toHaveText('設定');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ja');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-screen=settings] h2')).toHaveText('Settings');
  // 패드: B = 뒤로(타이틀), D-pad ↓ + A = 다음 항목 선택.
  await padTap(page, 1);
  await expect(page.locator('[data-screen=title]')).toBeVisible();
  await expect.poll(() => focusedId(page)).toBe('title-continue');
  await padTap(page, 13);
  await padTap(page, 13);
  await padTap(page, 13);
  await expect.poll(() => focusedId(page)).toBe('title-credits');
  await padTap(page, 0);
  await expect(page.locator('[data-screen=credits] .credit-list li')).toHaveCount(1);
  await padTap(page, 1);
  await expect(page.locator('[data-screen=title]')).toBeVisible();
});

test('menu mode on world-mini: title → new walk → HUD → pause disables game input', async ({ page }) => {
  await page.setViewportSize(STATE_VIEW);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?world=mini&debug=1&title=1&crowd=0');
  const root = page.locator('.ui-root');
  await expect(root).toHaveAttribute('data-top', 'title', { timeout: STATE_TIMEOUT_MS });
  const enabled = () =>
    page.evaluate(
      () =>
        (globalThis as unknown as { __SANPO_DEBUG__: { world: { input: { enabled: boolean } } } }).__SANPO_DEBUG__.world
          .input.enabled,
    );
  expect(await enabled()).toBe(false);
  await expect.poll(() => focusedId(page)).toBe('title-new');
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedId(page)).toBe('start-shibuya-scramble');
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-top', 'hud', { timeout: STATE_TIMEOUT_MS });
  await expect(page.locator('#sanpo-help')).toBeVisible();
  await expect.poll(enabled).toBe(true);
  const hud = decodePng(await page.screenshot());
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-top', 'pause');
  await expect.poll(enabled).toBe(false);
  const paused = decodePng(await page.screenshot());
  expect(meanLuma(paused), 'pause menu dims the scene').toBeLessThan(meanLuma(hud) * 0.9);
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-top', 'hud');
  await expect.poll(enabled).toBe(true);
  // 메뉴를 닫은 Esc가 다음 프레임 게임 입력(일시정지)으로 새면 다시 열린다 — 몇 프레임 뒤에도 HUD.
  await waitFrames(page, 5);
  await expect(root).toHaveAttribute('data-top', 'hud');
  expect(errors).toEqual([]);
});
