// 운전 계기판·탑승 안내(임시 DOM HUD — M10 @sanpo/ui가 대체): drive 중 오른쪽 아래 속도(km/h)·기어·RPM 막대·등화(전조등·방향지시등)·ABS/TCS,
// walk 중 운전석 문 앞이면 "F 운전하기"(hud.enterable). 게임 로직 없음 — traversal hud만 읽는다. 하차 실패 이유는 notice.
import type { GameSystem, Vec3d } from '@sanpo/core';
import type { DriveHud, TraversalService } from '@sanpo/traversal';
import { setPrompt } from '../shell/hud-state.ts';
import { notice } from '../station/hud.ts';
import type { DriveGuide } from './traffic-guide.ts';

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

/** 탑승 안내(가상 브랜드 — 실제 운영사 아님): 카셰어 SANPO Car · 공유자전거 SANPO Cycle. */
function enterPrompt(doc: Document, kind: 'sedan' | 'bicycle' | undefined): void {
  setPrompt(doc, 'vehicle', kind ? { key: kind === 'bicycle' ? 'hud.prompt.rideBike' : 'hud.prompt.driveCar' } : null);
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
    `${lamp(d.tcs, '#fc4', 'TCS')}${lamp(d.braking, '#f66', '제동')}${lamp(d.aeb, '#f44', '긴급제동')}</div>`
  );
}

/** 안내 한 줄(제한 속도·정지선 신호·역주행·보도). */
export function guideHtml(d: DriveHud, g: Readonly<DriveGuide> | undefined): string {
  const parts: string[] = [];
  if (g?.limitKmh) {
    const over = d.speedKmh > g.limitKmh + 10;
    parts.push(`<span style="color:${over ? '#f86' : '#ddd'}">제한 ${g.limitKmh}</span>`);
  }
  if (g?.stop)
    parts.push(
      `<span style="color:${g.stop.lamp === 'R' ? '#f55' : '#fd5'}">● 정지선 ${Math.round(g.stop.distM)} m</span>`,
    );
  if (g?.wrongWay) parts.push('<span style="color:#f86">역주행 — 일본은 좌측통행(왼쪽 차선)</span>');
  if (d.sidewalk) parts.push('<span style="color:#fd5">보도 — 10 km/h 서행</span>');
  return parts.length
    ? `<div style="margin-top:6px;font-size:12px;display:flex;flex-wrap:wrap;gap:8px">${parts.join('')}</div>`
    : '';
}

/** phase 67(HUD). */
export function driveHudSystem(
  doc: Document,
  traversal: TraversalService,
  guide?: { update(pos: Readonly<Vec3d>, yawRad: number, dtS: number): DriveGuide },
): GameSystem {
  let lastExit: DriveHud['exit'] = 'ready';
  return {
    id: 'wiring.driveHud',
    phase: 67,
    update(f) {
      const d = traversal.mode === 'drive' || traversal.mode === 'cycle' ? traversal.hud.drive : undefined;
      const el = panel(doc);
      el.style.display = d ? 'block' : 'none';
      const g = d ? guide?.update(traversal.player.posWF, traversal.player.yawRad, f.dtReal) : undefined;
      if (d) el.innerHTML = gaugeHtml(d) + guideHtml(d, g);
      if (g?.ranRed) notice(doc, { key: 'hud.notice.ranRed' });
      enterPrompt(doc, traversal.mode === 'walk' ? traversal.hud.enterable : undefined);
      const exit = d?.exit ?? 'ready';
      if (exit !== lastExit) {
        if (exit === 'moving') notice(doc, { key: 'hud.notice.exitMoving' });
        else if (exit === 'blocked') notice(doc, { key: 'hud.notice.exitBlocked' });
      }
      lastExit = exit;
    },
    dispose() {
      doc.getElementById('sanpo-drive')?.remove();
      setPrompt(doc, 'vehicle', null);
    },
  };
}
