// production 빌드에서 진단 도구 제외(ADR-0103): main.ts의 진단 진입점(UI 샌드박스·프로브·report=force)이 모두
// `__SANPO_DEBUG_TOOLS__` 상수 조건 뒤에 있어야 vite define(false)이 동적 import 청크째 없앤다. 배포 빌드가 플래그를 끄는지도 본다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(resolve(import.meta.dirname, rel), 'utf8');

describe('debug tools are gated out of production builds', () => {
  const main = read('../src/main.ts');

  it('guards every diagnostic entry point with __SANPO_DEBUG_TOOLS__', () => {
    for (const entry of [
      "q.get('ui-sandbox') === '1'",
      "flags.probe === 'decode'",
      "flags.probe === 'physics'",
      "q.get('report') === 'force'",
    ])
      expect(main).toContain(`__SANPO_DEBUG_TOOLS__ && ${entry}`);
    // 진단 모듈은 동적 import로만(정적 import면 상수 조건과 무관하게 번들에 남는다).
    expect(main).not.toMatch(/^import .*debug\/(ui-sandbox|decode-probe|physics-probe)/m);
  });

  it('keeps ?spawn= and ?debug=1 support (exploration / support)', () => {
    expect(read('../src/boot.ts')).toContain("q.get('spawn')");
    expect(main).toContain('flags.debug');
  });

  it('turns the tools off only in the production deploy build', () => {
    expect(read('../vite.config.ts')).toContain("process.env.SANPO_DEBUG_TOOLS !== '0'");
    const deploy = read('../../../.github/workflows/deploy.yml');
    const production = deploy.slice(deploy.indexOf('  production:'));
    expect(production).toContain("SANPO_DEBUG_TOOLS: '0'");
    expect(deploy.slice(0, deploy.indexOf('  production:'))).not.toContain('SANPO_DEBUG_TOOLS');
  });
});
