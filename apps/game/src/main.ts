// 브라우저 엔트리: 상태 화면 마운트 → boot(), 실패 시 오류 화면. see docs/modules/game.md
import { boot } from './boot.ts';
import { mountStatusView } from './status-view.ts';

const root = document.getElementById('app');
if (root === null) throw new Error('#app root element is missing from index.html');

const view = mountStatusView(root);
boot(view).catch((e: unknown) => {
  view.showError(`부트 실패: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
});
