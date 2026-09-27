// E2E 스모크(Playwright, Chromium): 빌드된 게임을 vite preview(격리 헤더 + dist/fixtures/world-mini)로 띄워 부트 확인. see docs/14-testing-perf.md §1
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['list']] : 'list',
  outputDir: '../../test-results',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // build 시 world-mini가 dist/fixtures로 복사된다(apps/game/vite.config.ts). preview는 격리 헤더를 붙인다.
    command: `pnpm --filter @sanpo/game build && pnpm --filter @sanpo/game preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
