// e2e 공용(`?debug=1` 핸들): 프레임 수·안정 플래그로 기다리기, 키 탭 뒤 프레임 처리 대기, 게임 루프 직후 캔버스 캡처.
// 시간 창이 아니라 게임 상태로 판정한다 — SwiftShader 병렬 러너는 프레임이 수 초까지 늘어난다(M05 결정 0). see docs/14-testing-perf.md §1
import { expect, type Page } from '@playwright/test';

/** 안전망 상한(ms). 판정은 상태(프레임 수·플래그)이고, 이 값은 멈춤(교착)을 실패로 끝내기 위한 것. */
export const STATE_TIMEOUT_MS = 120_000;

export const OVERLAY = '.debug-overlay';

type RenderHandle = { __SANPO_DEBUG__: { world: { render: { stats(): { frames: number } } } } };

/** 렌더한 프레임 수(render.stats().frames — 오버레이 갱신 주기와 무관). */
export function frames(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as unknown as RenderHandle).__SANPO_DEBUG__.world.render.stats().frames);
}

/** 지금부터 n프레임이 더 그려질 때까지. */
export async function waitFrames(page: Page, n: number): Promise<void> {
  const start = await frames(page);
  await expect.poll(() => frames(page), { timeout: STATE_TIMEOUT_MS }).toBeGreaterThanOrEqual(start + n);
}

/** 안정(스트리밍 0·HLOD 페이드 0·머티리얼·첫 품질 티어 결정 — 오버레이 `data-settled`) + 그 뒤 n프레임. */
export async function waitSettled(page: Page, n = 3): Promise<void> {
  await expect(page.locator(OVERLAY)).toHaveAttribute('data-settled', 'true', { timeout: STATE_TIMEOUT_MS });
  await waitFrames(page, n);
}

/**
 * 키 탭 → 2프레임 처리까지(phase 0 입력 스냅샷 → traversal 반영). 키 이벤트는 프레임 사이에 처리되므로
 * 다음 프레임이 반드시 본다 — 그 뒤 상태는 poll 없이 바로 확인할 수 있다.
 */
export async function press(page: Page, code: string): Promise<void> {
  const start = await frames(page);
  await page.keyboard.press(code);
  await expect.poll(() => frames(page), { timeout: STATE_TIMEOUT_MS }).toBeGreaterThanOrEqual(start + 2);
}

/**
 * 다음 프레임의 게임 루프 직후 캔버스(`#view`)를 PNG로. rAF를 작업(setTimeout)에서 등록하면 게임 루프 콜백 뒤에 실행돼
 * 표시 전 드로잉 버퍼를 읽는다 — page.screenshot(합성기 새 프레임 대기)은 SwiftShader 부하에서 수십 초 걸렸다.
 */
export async function captureCanvas(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    await new Promise((r) => setTimeout(r, 0));
    const oc = await new Promise<OffscreenCanvas>((resolve) => {
      requestAnimationFrame(() => {
        const c = new OffscreenCanvas(canvas.width, canvas.height);
        c.getContext('2d')?.drawImage(canvas, 0, 0);
        resolve(c);
      });
    });
    const bytes = new Uint8Array(await (await oc.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}
