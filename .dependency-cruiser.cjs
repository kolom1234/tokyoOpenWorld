// 패키지 경계·레이어 의존 규칙(CI 게이트). see docs/01-architecture.md §4, CLAUDE.md §5 Hard Rules 1–2
/** 워크스페이스 모듈 → 허용 의존(자기 자신 제외). 01-architecture §4 레이어 표와 1:1로 유지할 것. */
const LAYERS = {
  'packages/core': [],
  'packages/geo': ['core'],
  'packages/tile-format': ['core'],
  'packages/input': ['core', 'geo', 'tile-format'],
  'packages/streaming': ['core', 'geo', 'tile-format'],
  'packages/physics': ['core', 'geo', 'tile-format'],
  'packages/audio': ['core', 'geo', 'tile-format'],
  'packages/render': ['core', 'geo', 'tile-format'],
  'packages/sim': ['core', 'geo', 'tile-format'],
  // 예외: L3 traversal은 L2 input/physics의 공개 엔트리(api)만 사용한다.
  'packages/traversal': ['core', 'geo', 'input', 'physics'],
  'packages/ui': ['core'],
  'apps/worker': ['core', 'tile-format'],
  'tools/pipeline': ['core', 'geo', 'tile-format'],
  'tools/codemap': ['core'],
};
/** three.js(및 three 계열 addon)를 import해도 되는 모듈. */
const THREE_ALLOWED = ['packages/render', 'packages/sim', 'apps/game', 'tools/pipeline'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

const layerRules = Object.entries(LAYERS).map(([from, allowed]) => ({
  name: `layer:${from}`,
  comment: `${from}는 ${allowed.length ? allowed.join(', ') : '(없음)'}만 import 가능 (01-architecture §4)`,
  severity: 'error',
  from: { path: `^${esc(from)}/` },
  to: {
    path: '^(packages|apps|tools)/',
    pathNot: [`^${esc(from)}/`, ...allowed.map((p) => `^packages/${esc(p)}/`)],
  },
}));

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '순환 의존 금지 (전 구간 type-only인 순환은 런타임에 소거되므로 허용 — ADR-0013)',
      severity: 'error',
      from: {},
      to: { circular: true, via: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-cross-package-internals',
      comment: '다른 패키지는 @sanpo/<pkg> 공개 엔트리(src/index.ts)로만 import (Hard Rule 1)',
      severity: 'error',
      from: { path: '^(packages|apps|tools)/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/',
        pathNot: ['^packages/[^/]+/src/index\\.ts$', '^packages/$2/'],
      },
    },
    {
      name: 'no-unresolvable',
      comment: '해석되지 않는 import 금지(내부 경로 우회 import 포함)',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'worker-tile-format-types-only',
      comment: 'apps/worker는 tile-format을 타입으로만 사용 (01-architecture §4)',
      severity: 'error',
      from: { path: '^apps/worker/' },
      to: { path: '^packages/tile-format/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'three-only-in-allowed-layers',
      comment: 'three는 render/sim(+apps/game, tools/pipeline 헤드리스 유틸)만 사용',
      severity: 'error',
      from: { pathNot: `^(${THREE_ALLOWED.map(esc).join('|')})/` },
      to: { path: 'node_modules/(three|@types/three|@takram/three-[^/]+|three-mesh-bvh|@recast-navigation/three)/' },
    },
    {
      name: 'packages-not-to-apps-or-tools',
      comment: '패키지는 앱·툴에 의존할 수 없다',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^(apps|tools)/' },
    },
    ...layerRules,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
