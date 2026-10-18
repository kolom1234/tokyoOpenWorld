// UI 레이아웃 검사(M11-T04 — 배율 150 %): 보이는 UI 요소 중 ① 화면 밖(스크롤 컨테이너 안은 가로만), ② 글 잘림(overflow hidden·말줄임 아님),
// ③ 컨트롤 겹침(스크롤로 가려진 부분 제외), ④ 떠 있는 글(absolute·fixed — 안내·출처·축척) 겹침, ⑤ 가로 스크롤을 찾는다.
// 페이지 안에서 돈다: 아래 함수들을 한 스코프로 이어 붙인 식 `LAYOUT_PROBE`를 page.evaluate(문자열 — CDP 평가라 페이지 CSP와 무관). 반환 = 문제 목록.
type Box = { left: number; top: number; right: number; bottom: number };

function elName(e: Element): string {
  const cls = typeof e.className === 'string' && e.className ? `.${e.className.split(' ')[0]}` : '';
  return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${cls} "${(e.textContent ?? '').trim().slice(0, 24)}"`;
}

function isVisible(e: Element): boolean {
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  return (
    cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && r.width > 0 && r.height > 0
  );
}

/** 가장 가까운 잘라 내는(스크롤) 조상 사각형. */
function clipOf(e: Element): DOMRect | null {
  for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) return p.getBoundingClientRect();
  }
  return null;
}

/** 보이는 부분(잘라 내는 조상과 교집합). */
function seenBox(e: Element): Box {
  const r = e.getBoundingClientRect();
  const c = clipOf(e);
  if (!c) return r;
  return {
    left: Math.max(r.left, c.left),
    top: Math.max(r.top, c.top),
    right: Math.min(r.right, c.right),
    bottom: Math.min(r.bottom, c.bottom),
  };
}

function overlapPairs(list: Element[], box: (e: Element) => Box, tag: string, out: string[]): void {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i] as Element;
      const b = list[j] as Element;
      if (a.contains(b) || b.contains(a)) continue;
      const ra = box(a);
      const rb = box(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) out.push(`${tag} ${elName(a)} × ${elName(b)}`);
    }
}

function boundsProblems(all: Element[], out: string[]): void {
  for (const e of all) {
    const r = e.getBoundingClientRect();
    const clip = clipOf(e);
    if (clip) {
      const pcs = getComputedStyle(e.parentElement as Element);
      if (r.right > clip.right + 1 && !/(auto|scroll)/.test(pcs.overflowX) && e.children.length === 0)
        out.push(`clipped-x ${elName(e)} right ${Math.round(r.right)} > ${Math.round(clip.right)}`);
    } else if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
      out.push(`offscreen ${elName(e)} [${[r.left, r.top, r.right, r.bottom].map(Math.round).join(',')}]`);
    const cs = getComputedStyle(e);
    const cut = cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 1;
    if (cut && e.children.length === 0) out.push(`text-cut ${elName(e)} ${e.scrollWidth} > ${e.clientWidth}`);
  }
}

function layoutProblems(): string[] {
  const root = document.querySelector('.ui-root');
  if (!root) return ['no .ui-root'];
  const out: string[] = [];
  const all = [...root.querySelectorAll('*')].filter(isVisible);
  boundsProblems(all, out);
  overlapPairs(
    all.filter((e) => e.matches('button, input, select, .btn, .choice, .slider, .tab')),
    seenBox,
    'overlap',
    out,
  );
  const floating = all.filter(
    (e) => /^(absolute|fixed)$/.test(getComputedStyle(e).position) && (e.textContent ?? '').trim(),
  );
  overlapPairs(floating, (e) => e.getBoundingClientRect(), 'float-overlap', out);
  if (document.documentElement.scrollWidth > innerWidth + 1)
    out.push(`page-hscroll ${document.documentElement.scrollWidth}`);
  return [...new Set(out)];
}

/** page.evaluate(LAYOUT_PROBE) → string[]. */
export const LAYOUT_PROBE = `(() => { ${[elName, isVisible, clipOf, seenBox, overlapPairs, boundsProblems, layoutProblems].map(String).join('\n')}\nreturn layoutProblems(); })()`;
