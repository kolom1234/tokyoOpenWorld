// M11-T04 수락: UI 배율 150 %에서 레이아웃 깨짐 0 — 샌드박스(렌더 없음)에서 모든 메뉴 화면 × 3개 언어 × 1024×768·1280×720,
// HUD는 운전(경고 전부)·운전 + 알림·열차·알림 변형까지. 판정 = layout-probe.ts(화면 밖·글 잘림·컨트롤 겹침·떠 있는 글 겹침·가로 스크롤).
import { expect, type Page, test } from '@playwright/test';
import { LAYOUT_PROBE } from './layout-probe.ts';

const SCREENS = ['title', 'pause', 'settings', 'credits', 'map', 'log', 'photo'] as const;
const LANGS = ['ko', 'ja', 'en'] as const;
const SIZES = [
  [1024, 768],
  [1280, 720],
] as const;

async function open(page: Page, screen: string, lang: string): Promise<void> {
  await page.goto(`/?ui-sandbox=1&screen=${screen}&lang=${lang}&scale=1.5`);
  await page.waitForFunction(() => document.body.dataset.uiSandbox === 'ready');
  await page.waitForTimeout(150);
}

for (const [w, h] of SIZES)
  test(`UI scale 150 % has no layout breakage at ${w}×${h} (menus × 3 languages)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const problems: string[] = [];
    for (const screen of SCREENS)
      for (const lang of LANGS) {
        await open(page, screen, lang);
        for (const p of (await page.evaluate(LAYOUT_PROBE)) as string[]) problems.push(`${screen}/${lang}: ${p}`);
      }
    expect(problems).toEqual([]);
  });

test('UI scale 150 % HUD variants (drive with every warning, notices, train) at 1024×768', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const problems: string[] = [];
  for (const lang of LANGS)
    for (const variant of ['walk', 'drive', 'drive-notice', 'train', 'notice']) {
      await open(page, 'hud', lang);
      await page.evaluate((v) => {
        type Sig = { value: Record<string, unknown> };
        const b = (globalThis as { __SANPO_UI__?: { bridge: { hudSignal: Sig; settings: Sig } } }).__SANPO_UI__?.bridge;
        const s = b?.hudSignal;
        if (!b || !s) return;
        // 자막(M11-T04)도 켜고 띄운다 — 알림·안내와 겹치지 않아야 한다.
        b.settings.value = { ...b.settings.value, captions: true };
        const drive = {
          kind: 'sedan',
          speedKmh: 58,
          gear: 'D3',
          rpm: 0.6,
          lights: true,
          indicator: -1,
          braking: true,
          abs: true,
          tcs: true,
          aeb: true,
          sidewalk: true,
          limitKmh: 40,
          stop: { lamp: 'R', distM: 35 },
          wrongWay: true,
        };
        const name = { ja: '明治神宮', en: 'Meiji Jingu', ko: '메이지 신궁' };
        const train = {
          line: { ja: '山手線', en: 'Yamanote Line', ko: '야마노테선' },
          next: name,
          stopped: null,
          arrivalInS: 75,
        };
        s.value = {
          ...s.value,
          mode: v.startsWith('drive') ? 'drive' : v === 'train' ? 'train' : 'walk',
          drive: v.startsWith('drive') ? drive : null,
          train: v === 'train' ? train : null,
          notice: v.endsWith('notice') ? { key: 'hud.notice.discovered', params: { name } } : s.value.notice,
          noticeSeq: (s.value.noticeSeq as number) + 1,
          caption: { key: 'caption.stationChime' },
          captionSeq: (s.value.captionSeq as number) + 1,
        };
      }, variant);
      await page.waitForTimeout(150);
      for (const p of (await page.evaluate(LAYOUT_PROBE)) as string[]) problems.push(`hud-${variant}/${lang}: ${p}`);
    }
  expect(problems).toEqual([]);
});
