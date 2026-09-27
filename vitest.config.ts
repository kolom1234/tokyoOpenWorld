// 루트 Vitest 설정: 워크스페이스 각 패키지·앱·툴을 프로젝트로 실행. see docs/14-testing-perf.md
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'tools/*', 'scripts'],
  },
});
