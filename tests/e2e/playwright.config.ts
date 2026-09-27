// E2E 스모크(Playwright, Chromium): 빌드된 게임을 vite preview(격리 헤더 + dist/fixtures/world-mini)로 띄워 부트 확인. see docs/14-testing-perf.md §1
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = Boolean(process.env.CI);
/**
 * GPU 없는 러너: WebGPU 어댑터 없음 → three가 WebGL2로 폴백, WebGL2는 SwiftShader(CPU)로 그린다.
 * Chromium은 SwiftShader WebGL을 명시 허용해야 컨텍스트를 만든다(`--enable-unsafe-swiftshader`).
 * `PW_CHROMIUM_PATH`: Playwright 번들 버전과 다른 로컬 Chromium을 쓸 때(예: 클라우드 세션 `/opt/pw-browsers/chromium`).
 */
const LAUNCH_OPTIONS = {
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
};

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // SwiftShader 렌더는 수 FPS라 셀 표시·스크린샷까지 여유를 둔다.
  timeout: 90_000,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['list']] : 'list',
  outputDir: '../../test-results',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions: LAUNCH_OPTIONS },
    },
  ],
  webServer: {
    // build 시 world-mini가 dist/fixtures로 복사된다(apps/game/vite.config.ts). preview는 격리 헤더를 붙인다.
    command: `pnpm --filter @sanpo/game build && pnpm --filter @sanpo/game preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
