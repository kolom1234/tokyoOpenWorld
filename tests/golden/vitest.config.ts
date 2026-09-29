// tests/golden 단위 테스트(SSIM·views.json 검사)만 — golden.spec.ts는 Playwright(`pnpm golden`) 전용이라 제외.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { name: 'golden', include: ['*.test.ts'] } });
