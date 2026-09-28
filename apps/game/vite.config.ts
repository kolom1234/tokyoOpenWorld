// 게임 번들 설정(Vite): dev 서버 격리 헤더 + /api·/world → wrangler dev 프록시 + world-mini 픽스처 서빙·복사 + 로컬 빌드(dev 전용). see docs/13-deployment.md §2–3, docs/modules/game.md
import { cpSync, createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { type Connect, defineConfig, type Plugin } from 'vite';

/** dev/preview 서버에서도 crossOriginIsolated가 되도록 정적 에셋용 `public/_headers`와 같은 격리 헤더를 붙인다. */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** `wrangler dev --env local` 기본 주소(apps/worker `dev` 스크립트). */
const WORKER_DEV_ORIGIN = 'http://localhost:8787';

/** 저장소 픽스처(M01-T07, Vite root = apps/game 기준) → `/fixtures/world-mini/*`. 게임은 `?world=mini`일 때만 쓴다(world-load.ts). */
const WORLD_MINI_REL = '../../tests/fixtures/world-mini';
const WORLD_MINI_ROUTE = '/fixtures/world-mini';

/** `dir` 아래 파일을 그대로 서빙하는 미들웨어(경로 탈출 방지, 없으면 next). */
function serveDir(dir: () => string | undefined): Connect.NextHandleFunction {
  return (req, res, next) => {
    const root = dir();
    if (!root) return next();
    const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    createReadStream(file).pipe(res);
  };
}

/** 로컬 파이프라인 빌드 루트(Vite root 기준). */
const LOCAL_BUILDS_REL = '../../data/build';
const LOCAL_WORLD_ROUTE = '/local-world';

/**
 * dev 전용 `/local-world/*` → `data/build/<SANPO_LOCAL_BUILD>`(없으면 가장 최근 수정된 빌드). 게임은 `?world=local`(world-load.ts).
 * build에는 포함하지 않는다(원천·빌드 데이터는 배포·커밋 대상 아님 — publish는 R2, docs/13).
 */
function localBuild(): Plugin {
  let builds = LOCAL_BUILDS_REL;
  const pick = (): string | undefined => {
    if (!existsSync(builds)) return undefined;
    const id =
      process.env.SANPO_LOCAL_BUILD ??
      readdirSync(builds)
        .filter((d) => existsSync(join(builds, d, 'world.json')))
        .sort((a, b) => statSync(join(builds, b)).mtimeMs - statSync(join(builds, a)).mtimeMs)[0];
    return id ? join(builds, id) : undefined;
  };
  return {
    name: 'sanpo-local-build',
    apply: 'serve',
    configResolved(c) {
      builds = resolve(c.root, LOCAL_BUILDS_REL);
    },
    configureServer(server) {
      server.middlewares.use(LOCAL_WORLD_ROUTE, serveDir(pick));
    },
  };
}

/**
 * dev: 미들웨어로 픽스처 파일 서빙. build: `dist/fixtures/world-mini`로 복사(→ vite preview·PR preview·staging 정적 에셋).
 * `SANPO_WORLD_MINI=0`이면 복사하지 않는다(production 배포, docs/13 §7).
 */
function worldMiniFixture(): Plugin {
  let outDir = 'dist';
  let src = WORLD_MINI_REL;
  return {
    name: 'sanpo-world-mini',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
      src = resolve(c.root, WORLD_MINI_REL);
    },
    configureServer(server) {
      server.middlewares.use(
        WORLD_MINI_ROUTE,
        serveDir(() => src),
      );
    },
    writeBundle() {
      if (process.env.SANPO_WORLD_MINI === '0' || !existsSync(src)) return;
      cpSync(src, join(outDir, WORLD_MINI_ROUTE), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [worldMiniFixture(), localBuild()],
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
