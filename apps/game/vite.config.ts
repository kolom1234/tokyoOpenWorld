// 게임 번들 설정(Vite): dev 서버 격리 헤더 + /api·/world → wrangler dev 프록시. see docs/13-deployment.md §2–3, docs/modules/game.md
import { defineConfig } from 'vite';

/** dev/preview 서버에서도 crossOriginIsolated가 되도록 정적 에셋용 `public/_headers`와 같은 격리 헤더를 붙인다. */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** `wrangler dev --env local` 기본 주소(apps/worker `dev` 스크립트). */
const WORKER_DEV_ORIGIN = 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    headers: ISOLATION_HEADERS,
    proxy: {
      '^/api/': { target: WORKER_DEV_ORIGIN },
      '^/world(/|$)': { target: WORKER_DEV_ORIGIN },
    },
  },
  preview: { headers: ISOLATION_HEADERS },
  build: {
    target: 'es2024',
    // public/_headers의 `/assets/*` immutable 규칙과 짝을 이룬다(파일명에 해시 포함).
    assetsDir: 'assets',
  },
});
