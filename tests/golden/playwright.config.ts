// 골든뷰(M03-T10): 실제 GPU Chrome(`channel: 'chrome'`, headed — WebGPU 하드웨어 어댑터) 2560×1440, DPR 1. CI에서는 돌리지 않는다(GPU 없음).
// 서버: 기본 vite dev(`?world=local` → data/build 최신), `GOLDEN_BASE_URL`이면 그 주소(예: staging + GOLDEN_WORLD=api). see tests/golden/README.md
import { defineConfig } from '@playwright/test';

const PORT = 5199;
const BASE = process.env.GOLDEN_BASE_URL;

export default defineConfig({
  testDir: '.',
  testMatch: 'golden.spec.ts',
  timeout: 600_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/golden-pw',
  use: {
    baseURL: BASE ?? `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: process.env.GOLDEN_HEADLESS === '1',
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    launchOptions: {
      // developer-features: GPU 타임스탬프 쿼리 100 µs 양자화 해제(성능 표). ignore-gpu-blocklist: 노트북 GPU 드라이버 차단 회피.
      args: ['--enable-webgpu-developer-features', '--ignore-gpu-blocklist', '--window-size=1280,760'],
    },
  },
  ...(BASE
    ? {}
    : {
        webServer: {
          command: `pnpm --filter @sanpo/game exec vite --port ${PORT} --strictPort`,
          url: `http://localhost:${PORT}`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
