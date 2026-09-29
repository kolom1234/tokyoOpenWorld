// 브라우저 엔트리: 상태 화면 마운트 → boot(), 실패 시 오류 화면. see docs/modules/game.md
import { boot, parseFlags } from './boot.ts';
import { mountStatusView } from './status-view.ts';
import { WORLD_MINI_BASE_URL } from './world-load.ts';

const root = document.getElementById('app');
if (root === null) throw new Error('#app root element is missing from index.html');

const view = mountStatusView(root);
const flags = parseFlags(location.search);
if (flags.probe === 'decode') {
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
  boot(view, flags).catch((e: unknown) => {
    view.showError(`부트 실패: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  });
}
