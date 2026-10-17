// 운전 계기판·탑승 안내(임시 DOM HUD — M10 @sanpo/ui가 대체): drive 중 오른쪽 아래 속도(km/h)·기어·RPM 막대·등화(전조등·방향지시등)·ABS/TCS,
// walk 중 운전석 문 앞이면 "F 운전하기"(hud.enterable). 게임 로직 없음 — traversal hud만 읽는다. 하차 실패 이유는 notice.
import type { GameSystem } from '@sanpo/core';
import type { DriveHud, TraversalService } from '@sanpo/traversal';
import { notice } from '../station/hud.ts';

const RPM_MAX = 6500;

function panel(doc: Document): HTMLElement {
  let el = doc.getElementById('sanpo-drive');
  if (el) return el;
  el = doc.createElement('div');
  el.id = 'sanpo-drive';
  el.setAttribute('role', 'status');
  el.style.cssText =
    'position:fixed;right:16px;bottom:16px;min-width:190px;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.5);' +
    'color:#f4f4f4;font:13px/1.35 system-ui,sans-serif;pointer-events:none;z-index:30;display:none';
  doc.body.append(el);
  return el;
}

function enterPrompt(doc: Document, show: boolean): void {
  let el = doc.getElementById('vehicle-prompt');
  if (!el && !show) return;
  if (!el) {
    el = doc.createElement('div');
    el.id = 'vehicle-prompt';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);padding:6px 14px;border-radius:6px;' +
      'background:rgba(10,90,95,.85);color:#fff;font:14px system-ui,sans-serif;pointer-events:none;z-index:50';
    el.textContent = 'F (패드 X) 운전하기 — 카셰어 차';
    doc.body.append(el);
  }
  el.style.display = show ? 'block' : 'none';
}

/** 계기판 HTML(숫자·막대 — innerHTML은 우리 값만). */
export function gaugeHtml(d: DriveHud): string {
  const rpm = Math.max(0, Math.min(1, d.rpm / RPM_MAX));
  const blink = (Date.now() / 333) % 2 < 1;
  const arrow = (dir: -1 | 1) => (d.indicator === dir && blink ? '#3f3' : '#555');
  const lamp = (on: boolean, c: string, t: string) =>
    `<span style="padding:0 4px;border-radius:3px;background:${on ? c : '#333'};color:${on ? '#000' : '#888'}">${t}</span>`;
  return (
    `<div style="display:flex;align-items:baseline;gap:10px">` +
    `<span style="color:${arrow(-1)};font-size:18px">◀</span>` +
    `<span style="font:600 34px system-ui">${Math.round(d.speedKmh)}</span><span>km/h</span>` +
    `<span style="font:600 20px system-ui;margin-left:auto">${d.gear}</span>` +
    `<span style="color:${arrow(1)};font-size:18px">▶</span></div>` +
    `<div style="height:5px;background:#333;border-radius:3px;margin:4px 0"><div style="height:5px;width:${(rpm * 100).toFixed(0)}%;` +
    `background:${rpm > 0.85 ? '#f55' : '#7cf'};border-radius:3px"></div></div>` +
    `<div style="display:flex;gap:4px;font-size:11px">${lamp(d.lights, '#9df', '전조등')}${lamp(d.abs, '#fc4', 'ABS')}` +
    `${lamp(d.tcs, '#fc4', 'TCS')}${lamp(d.braking, '#f66', '제동')}</div>`
  );
}

/** phase 67(HUD). */
export function driveHudSystem(doc: Document, traversal: TraversalService): GameSystem {
  let lastExit: DriveHud['exit'] = 'ready';
  return {
    id: 'wiring.driveHud',
    phase: 67,
    update() {
      const d = traversal.mode === 'drive' ? traversal.hud.drive : undefined;
      const el = panel(doc);
      el.style.display = d ? 'block' : 'none';
      if (d) el.innerHTML = gaugeHtml(d);
      enterPrompt(doc, traversal.mode === 'walk' && traversal.hud.enterable !== undefined);
      const exit = d?.exit ?? 'ready';
      if (exit !== lastExit) {
        if (exit === 'moving') notice(doc, '차를 멈춘 뒤 F로 내릴 수 있어요');
        else if (exit === 'blocked') notice(doc, '내릴 자리가 없어요(벽·턱·높이 차) — 조금 옮겨 세운 뒤 F');
      }
      lastExit = exit;
    },
    dispose() {
      doc.getElementById('sanpo-drive')?.remove();
      doc.getElementById('vehicle-prompt')?.remove();
    },
  };
}
