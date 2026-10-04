// 부트 스모크: `?world=mini`로 월드 픽스처를 로드해 부트 화면이 loaded 상태가 되는지, 격리·콘솔 오류 확인. see docs/14-testing-perf.md §1, docs/modules/game.md
import { expect, test } from '@playwright/test';
import { STATE_TIMEOUT_MS } from './game.ts';

test('boots with world-mini (fixture) and loads the 4 cells around the Scramble spawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?world=mini');
  const app = page.locator('#app');
  // 상태 대기: world.json 조회 콜백은 렌더 생성 직후 시작한 선컴파일(대기 LUT·셰이더 — SwiftShader에선 메인 스레드 수 초, ADR-0060)과
  // 같은 스레드라, 워커 2 병렬에서 'loaded'가 기본 5 s를 넘는다(로컬 2페이지 동시 12.9 s). 아래 단언은 loaded 뒤 같은 갱신에서 정해지는 값.
  await expect(app).toHaveAttribute('data-world', 'loaded', { timeout: STATE_TIMEOUT_MS });
  await expect(app).toHaveAttribute('data-world-source', 'fixture');
  await expect(app).toHaveAttribute('data-world-cells', '4');
  await expect(app).toHaveAttribute('data-isolated', 'true');
  await expect(app).toHaveAttribute('data-webgpu', /^(available|no-adapter|unsupported)$/);
  await expect(page.locator('dd[data-key="world"]')).toContainText('셀 4/4');
  expect(errors).toEqual([]);
});

test('without the flag the boot screen reports the API state instead of crashing', async ({ page }) => {
  await page.goto('/');
  // preview는 /api를 wrangler dev(8787)로 프록시하지만 Worker가 없다 → 프록시 오류 → error 상태로 표시되어야 한다.
  await expect(page.locator('#app')).toHaveAttribute('data-world', /^(error|unconfigured|no-build)$/);
});
