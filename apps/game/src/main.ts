// 브라우저 엔트리: 상태 화면(e2e data-* — 화면에서는 UI 로딩 화면이 대신) + @sanpo/ui 셸 마운트 → boot(), 실패 시 오류 화면.
// `?ui-sandbox=1` = 게임 없이 UI만(목 브리지 — 화면·언어 확인, M10-T01). see docs/modules/game.md
// UI 글꼴(OFL — docs/03 §4): 유니코드 범위 조각 woff2(가변 wght) 자체 호스팅 — 브라우저가 화면에 쓰인 글자의 조각만 받는다(font-display swap).
import '@fontsource-variable/noto-sans-jp/wght.css';
import '@fontsource-variable/noto-sans-kr/wght.css';
import { boot, parseFlags } from './boot.ts';
import { createReporter, DEFAULT_REPORT_RATE, installErrorReporting } from './error-report.ts';
import { createShell } from './shell/bridge.ts';
import { loadingView } from './shell/loading.ts';
import { menusEnabled, storageOf } from './shell/options.ts';
import { mountStatusView } from './status-view.ts';
import { WORLD_MINI_BASE_URL } from './world-load.ts';

const QUALITY_TIERS = ['low', 'medium', 'high', 'ultra'];
const root = document.getElementById('app');
if (root === null) throw new Error('#app root element is missing from index.html');

function uiRoot(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'ui';
  document.body.append(el);
  return el;
}

const flags = parseFlags(location.search);
const q = new URLSearchParams(location.search);
if (q.get('ui-sandbox') === '1') {
  root.classList.add('behind-ui');
  void import('./debug/ui-sandbox.ts').then((m) => m.runUiSandbox(uiRoot(), q));
} else if (flags.probe === 'decode') {
  const view = mountStatusView(root);
  // 디버그 프로브: 렌더 없이 streaming 디코드 워커만 측정(e2e decode.spec.ts). 별도 청크로 동적 import.
  root.dataset.probe = 'running';
  void import('./debug/decode-probe.ts')
    .then((m) => m.runDecodeProbe(WORLD_MINI_BASE_URL))
    .then((report) => {
      Object.assign(globalThis, { __SANPO_DECODE_PROBE__: report });
      root.dataset.probe = 'done';
    })
    .catch((e: unknown) => {
      root.dataset.probe = 'error';
      view.showError(`decode probe: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    });
} else if (flags.probe === 'physics') {
  const view = mountStatusView(root);
  // 물리 워커 프로브(M04-T01, e2e physics.spec.ts): Jolt 워커 + 상자 낙하. 별도 청크.
  root.dataset.probe = 'running';
  void import('./debug/physics-probe.ts')
    .then((m) => m.runPhysicsProbe(flags.physicsIsolation ?? 'auto'))
    .then((report) => {
      Object.assign(globalThis, { __SANPO_PHYSICS_PROBE__: report });
      root.dataset.probe = 'done';
    })
    .catch((e: unknown) => {
      root.dataset.probe = 'error';
      view.showError(`physics probe: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    });
} else {
  root.classList.add('behind-ui');
  const shell = createShell(document, uiRoot(), {
    menus: menusEnabled(flags, q),
    save: menusEnabled(flags, q) || q.get('save') === '1',
    storage: storageOf(),
    fixedQuality: flags.quality !== undefined || flags.view !== undefined,
    fixedFov: flags.view !== undefined,
  });
  installErrorReporting(
    window,
    createReporter(
      {
        buildId: () => shell.buildId ?? '',
        backend: () => root.dataset.backend ?? 'none',
        gpuTier: () => QUALITY_TIERS.indexOf(storageOf()?.getItem('sanpo.quality.v1') ?? ''),
        lang: () => document.documentElement.lang,
        mode: () => shell.ui.screen.peek(),
      },
      { rate: DEFAULT_REPORT_RATE, force: q.get('report') === 'force', version: __SANPO_VERSION__ },
    ),
  );
  // e2e·실제 GPU 측정 핸들(HUD 시그널 갱신 빈도·화면 상태 — 디버그 모드만).
  if (flags.debug) Object.assign(globalThis, { __SANPO_SHELL__: shell });
  const view = loadingView(mountStatusView(root), shell.loading);
  boot(view, flags, shell).catch((e: unknown) => {
    view.showError(`부트 실패: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  });
}
