// 크레딧 자동 생성(M10-T06, 03 §8, ADR-0096): data/sources.lock.json 모든 원천 + content/ATTRIBUTION.json(에셋·텍스트) → credits.json, 게임 런타임 의존(전이 포함) package.json → oss-licenses.json.
// 게임 빌드(Vite 플러그인)가 정적 파일로 내보내고 dev 서버가 같은 내용을 서빙한다. 순수 부분은 테스트(scripts/test/credits.test.ts).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface LockSource {
  id: string;
  url?: string;
  dataset?: string;
  resource?: string;
  license?: string;
  attribution?: string;
}
export interface AttributionEntry {
  id: string;
  kind: string;
  title: string;
  url?: string;
  license: string;
  attribution?: { ja?: string; en?: string; ko?: string };
}
export interface CreditData {
  id: string;
  kind: string;
  title: string;
  license: string;
  url: string | null;
  attribution: { ja: string; en: string; ko: string } | null;
  locked: boolean;
}
export interface OssPackage {
  name: string;
  version: string;
  license: string;
}

const isUrl = (s: string | undefined): s is string => !!s && /^https?:\/\//.test(s);

/** lock 원천은 모두(쓰지 않는 것도 — "lock 전 소스 표시"), ATTRIBUTION은 lock에 없는 항목을 덧붙인다(같은 id면 3개 언어 표기를 합친다). */
export function creditsData(lock: readonly LockSource[], attribution: readonly AttributionEntry[]): CreditData[] {
  const byId = new Map(attribution.map((a) => [a.id, a]));
  const out: CreditData[] = lock.map((s) => {
    const a = byId.get(s.id);
    const ja = a?.attribution?.ja ?? s.attribution ?? '';
    return {
      id: s.id,
      kind: a?.kind ?? 'data',
      title: a?.title ?? s.resource ?? s.id,
      license: s.license ?? a?.license ?? 'unknown',
      url: isUrl(s.dataset) ? s.dataset : isUrl(s.url) ? s.url : (a?.url ?? null),
      attribution:
        ja || a?.attribution
          ? { ja, en: a?.attribution?.en ?? ja, ko: a?.attribution?.ko ?? a?.attribution?.en ?? ja }
          : null,
      locked: true,
    };
  });
  const locked = new Set(lock.map((s) => s.id));
  for (const a of attribution) {
    if (locked.has(a.id)) continue;
    const at = a.attribution;
    out.push({
      id: a.id,
      kind: a.kind,
      title: a.title,
      license: a.license,
      url: a.url ?? null,
      attribution:
        at?.ja || at?.en
          ? { ja: at.ja ?? at.en ?? '', en: at.en ?? at.ja ?? '', ko: at.ko ?? at.en ?? at.ja ?? '' }
          : null,
      locked: false,
    });
  }
  return out;
}

interface PkgJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  dependencies?: Record<string, string>;
  author?: string | { name?: string };
  repository?: string | { url?: string };
}

const readPkg = (dir: string): PkgJson => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PkgJson;

/** dir에서 위로 node_modules/<name> 찾기(pnpm 형제 링크 포함). */
function resolveDep(dir: string, name: string): string | undefined {
  let d = dir;
  for (;;) {
    const c = join(d, 'node_modules', name);
    if (existsSync(join(c, 'package.json'))) return realpathSync(c);
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
}

/** package.json에 license가 없으면 LICENSE 파일 문구로 추정(예: suncalc = BSD-2-Clause). */
function licenseFromFile(dir: string): string {
  const f = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'].map((n) => join(dir, n)).find((x) => existsSync(x));
  if (!f) return 'UNKNOWN';
  const t = readFileSync(f, 'utf8');
  if (/Permission is hereby granted, free of charge/.test(t)) return 'MIT';
  if (/Apache License/.test(t)) return 'Apache-2.0';
  if (/Redistribution and use in source and binary forms/.test(t))
    return /^\s*3\./m.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (/Permission to use, copy, modify, and\/or distribute/.test(t)) return 'ISC';
  return 'SEE LICENSE FILE';
}

function licenseOf(p: PkgJson, dir: string): string {
  if (typeof p.license === 'string') return p.license;
  if (p.license?.type) return p.license.type;
  if (p.licenses?.length) return p.licenses.map((l) => l.type).join(' OR ');
  return licenseFromFile(dir);
}

/** 앱의 런타임 의존(전이) — 워크스페이스 패키지(@sanpo/*)는 목록에서 빼되 그 의존은 따라간다. 이름순(+ 패키지 폴더). */
function walkPackages(appDir: string): { pkg: OssPackage; dir: string }[] {
  const seen = new Map<string, { pkg: OssPackage; dir: string }>();
  const visited = new Set<string>();
  const walk = (dir: string): void => {
    const real = realpathSync(dir);
    if (visited.has(real)) return;
    visited.add(real);
    const p = readPkg(real);
    if (p.name && !p.name.startsWith('@sanpo/') && real !== realpathSync(appDir))
      seen.set(`${p.name}@${p.version}`, {
        pkg: { name: p.name, version: p.version ?? '', license: licenseOf(p, real) },
        dir: real,
      });
    for (const dep of Object.keys(p.dependencies ?? {})) {
      const d = resolveDep(real, dep);
      if (d) walk(d);
    }
  };
  walk(appDir);
  return [...seen.values()].sort(
    (a, b) => a.pkg.name.localeCompare(b.pkg.name) || a.pkg.version.localeCompare(b.pkg.version),
  );
}

export function ossPackages(appDir: string): OssPackage[] {
  return walkPackages(appDir).map((e) => e.pkg);
}

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** npm 패키지에 LICENSE 파일이 없을 때: package.json 선언 라이선스 + 저작자·저장소 + (MIT면) 표준 MIT 문구. */
function declaredOnly(pkg: OssPackage, p: PkgJson): string {
  const author = typeof p.author === 'string' ? p.author : p.author?.name;
  const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
  const head = [
    `No license file is shipped in the npm package; license declared in package.json: ${pkg.license}.`,
    `Copyright (c) ${author ?? `the ${pkg.name} authors`}${repo ? ` — ${repo}` : ''}`,
  ].join('\n');
  return /\bMIT\b/.test(pkg.license) ? `${head}\n\n${MIT_TEXT}` : head;
}

/** 고지 전문(M11-T05): 패키지마다 LICENSE·NOTICE 파일 원문(MIT·BSD·Apache·OFL의 "저작권 고지 + 허가 문구 동반" 조건) → /oss-licenses.txt. */
export function ossNotices(appDir: string): string {
  const files = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE', 'NOTICE', 'NOTICE.md', 'NOTICE.txt'];
  const parts = walkPackages(appDir).map(({ pkg, dir }) => {
    const texts = files
      .map((n) => join(dir, n))
      .filter((f) => existsSync(f))
      .map((f) => readFileSync(f, 'utf8').trim());
    const body = texts.length ? texts.join('\n\n') : declaredOnly(pkg, readPkg(dir));
    const rule = '-'.repeat(77);
    return `${rule}\n${pkg.name}@${pkg.version} — ${pkg.license}\n${rule}\n${body}\n`;
  });
  return `TOKYO SANPO — open-source runtime dependencies (license texts)\n\n${parts.join('\n')}`;
}

export function buildCredits(repoRoot: string): { credits: string; oss: string; ossText: string } {
  const lock = (JSON.parse(readFileSync(join(repoRoot, 'data/sources.lock.json'), 'utf8')) as { sources: LockSource[] })
    .sources;
  const attr = (
    JSON.parse(readFileSync(join(repoRoot, 'content/ATTRIBUTION.json'), 'utf8')) as { entries: AttributionEntry[] }
  ).entries;
  return {
    credits: `${JSON.stringify({ data: creditsData(lock, attr) })}\n`,
    oss: `${JSON.stringify({ packages: ossPackages(join(repoRoot, 'apps/game')) })}\n`,
    ossText: ossNotices(join(repoRoot, 'apps/game')),
  };
}
