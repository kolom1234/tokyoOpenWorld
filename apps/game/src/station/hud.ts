// 역·탐방 임시 HUD(M07-T06·후속 — M08 @sanpo/ui가 대체): 상호작용 안내 줄(F …), 화면 페이드, 몇 초 뜨는 알림(구조·내리기 실패 이유 등).
// DOM만(게임 로직 없음). id = e2e·봇이 읽는다(`#station-prompt`, `#station-fade`, `#sanpo-notice`).

const FADE_S = 0.3;

/** 상호작용 안내(null = 숨김). */
export function prompt(doc: Document, text: string | null): void {
  let el = doc.getElementById('station-prompt');
  if (!el && text === null) return;
  if (!el) {
    el = doc.createElement('div');
    el.id = 'station-prompt';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);padding:6px 14px;border-radius:6px;' +
      'background:rgba(20,40,90,.8);color:#fff;font:14px system-ui,sans-serif;pointer-events:none;z-index:50';
    doc.body.append(el);
  }
  el.style.display = text === null ? 'none' : 'block';
  if (text !== null && el.textContent !== text) el.textContent = text;
}

/** 검은 막 페이드(FADE_S). */
export function fade(doc: Document, on: boolean): void {
  let el = doc.getElementById('station-fade');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'station-fade';
    el.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition:opacity ${FADE_S}s`;
    doc.body.append(el);
  }
  el.style.opacity = on ? '1' : '0';
}
export const FADE_MS = FADE_S * 1000;

const timers = new WeakMap<Document, ReturnType<typeof setTimeout>>();

/** 알림(ms 뒤 사라짐) — 안내 줄보다 위. */
export function notice(doc: Document, text: string, ms = 4000): void {
  let el = doc.getElementById('sanpo-notice');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'sanpo-notice';
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);max-width:min(560px,90vw);padding:8px 16px;border-radius:6px;' +
      'background:rgba(90,40,20,.85);color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:51';
    doc.body.append(el);
  }
  el.textContent = text;
  el.style.display = 'block';
  const prev = timers.get(doc);
  if (prev !== undefined) clearTimeout(prev);
  const target = el;
  timers.set(
    doc,
    setTimeout(() => {
      target.style.display = 'none';
    }, ms),
  );
}

/** 역 근접 안내(화면 위 가운데, null = 숨김 — station/guide.ts). */
export function guide(doc: Document, text: string | null): void {
  let el = doc.getElementById('station-guide');
  if (!el && text === null) return;
  if (!el) {
    el = doc.createElement('div');
    el.id = 'station-guide';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:5px 14px;border-radius:6px;' +
      'background:rgba(20,50,79,.85);border-bottom:3px solid #f08a24;color:#fff;font:14px system-ui,sans-serif;pointer-events:none;z-index:50';
    doc.body.append(el);
  }
  el.style.display = text === null ? 'none' : 'block';
  if (text !== null && el.textContent !== text) el.textContent = text;
}
