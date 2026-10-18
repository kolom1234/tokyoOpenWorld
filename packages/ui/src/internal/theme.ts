// UI 스타일(문자열 → <style>, 번들러 CSS 처리 없이 샌드박스·게임 공통). 폰트 = 시스템 일·한 고딕(⚠️ Noto 서브셋 자체 호스팅은 후속 — docs/12 §1).
export const THEME_CSS = `
.ui-root{position:fixed;inset:0;z-index:20;pointer-events:none;color:#f3f1ec;
  font:calc(15px * var(--ui-scale,1))/1.45 "Noto Sans JP","Noto Sans KR","Hiragino Sans","Yu Gothic UI","Meiryo UI","Malgun Gothic",system-ui,sans-serif;
  --accent:#f08a24;--panel:rgba(14,18,26,.78);--line:rgba(255,255,255,.14);--muted:#b8b4ab}
.ui-root kbd{display:inline-block;min-width:1.6em;padding:0 .35em;border:1px solid rgba(255,255,255,.35);border-bottom-width:2px;border-radius:4px;
  font:600 .82em/1.5 ui-monospace,monospace;text-align:center;background:rgba(255,255,255,.08)}
.screen{position:absolute;inset:0}
.menu{pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8em;padding:2em;
  background:radial-gradient(ellipse at center,rgba(8,10,16,.55),rgba(8,10,16,.82))}
.menu h2{margin:0 0 .3em;font-size:1.6em;font-weight:600;letter-spacing:.04em}
.menu h3{margin:1.2em 0 .4em;font-size:1.05em;color:var(--accent)}
.logo{margin:0;font:700 2.4em/1.1 system-ui,sans-serif;letter-spacing:.18em;text-align:center}
.logo span{display:block;margin-top:.35em;font-size:.42em;letter-spacing:.3em;color:var(--accent)}
.logo.big{font-size:3.4em}
.tagline{margin:.2em 0 1.4em;color:var(--muted);text-align:center}
.menu-list{display:flex;flex-direction:column;gap:.45em;min-width:min(22em,80vw)}
.menu-list h2{font-size:1.15em;text-align:center}
.menu-row{display:flex;gap:.8em;justify-content:center;margin-top:.6em}
.btn,.choice,.slider,.keycap,.tab{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--line);background:var(--panel);
  border-radius:8px;padding:.55em 1.1em;outline:none;transition:background .12s,border-color .12s,transform .12s}
.btn{font-size:1.05em;text-align:center}
.btn-plain{background:transparent}
.btn:disabled{opacity:.4;cursor:default}
.btn:focus,.btn:hover,.choice:focus,.choice:hover,.slider:focus,.slider:hover,.keycap:focus,.keycap:hover,.tab:focus,.tab:hover{
  border-color:var(--accent);background:rgba(240,138,36,.22)}
.btn:focus,.choice:focus,.slider:focus,.keycap:focus,.tab:focus{box-shadow:0 0 0 2px var(--accent)}
.nav-hint{position:absolute;bottom:1.2em;left:0;right:0;text-align:center;color:var(--muted);font-size:.85em}
.busy{color:var(--accent)}
.settings{justify-content:flex-start;padding-top:5vh}
.tabs{display:flex;gap:.4em;flex-wrap:wrap;justify-content:center}
.tab{padding:.4em .9em}
.tab.active{border-color:var(--accent);color:#fff;background:rgba(240,138,36,.35)}
.tab-body{width:min(46em,92vw);max-height:62vh;overflow:auto;padding:.6em 1em;border:1px solid var(--line);border-radius:10px;background:rgba(10,13,20,.6)}
.row{display:flex;align-items:center;justify-content:space-between;gap:1em;padding:.45em 0;border-bottom:1px solid rgba(255,255,255,.06)}
.row-label{display:flex;flex-direction:column}
.row-label small{color:var(--muted);font-size:.8em;max-width:26em}
.row-control{flex:0 0 auto}
.choice{display:flex;align-items:center;gap:.7em;min-width:13em;justify-content:space-between;padding:.4em .7em}
.choice .arrow{color:var(--accent);font-size:.8em}
.slider{display:flex;align-items:center;gap:.7em;min-width:15em;padding:.45em .7em;touch-action:none}
.slider-track{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;pointer-events:none}
.slider-fill{display:block;height:100%;background:var(--accent)}
.slider-value{min-width:3.6em;text-align:right;font-variant-numeric:tabular-nums;pointer-events:none}
.keycap{min-width:8em;font-family:ui-monospace,monospace}
.keycap.changed{color:var(--accent)}
.keycap[data-capturing]{border-color:#fff;background:rgba(255,255,255,.18)}
.note{color:var(--muted);font-size:.88em;margin:.4em 0}
.warn{color:#f5b971}
.boot{display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d0f14;pointer-events:auto}
.boot-center{display:flex;flex-direction:column;align-items:center;gap:1.1em;width:min(34em,86vw)}
.boot-stage{color:#e8e4dc}
.boot-detail{color:var(--muted)}
.progress{width:100%;height:4px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}
.progress-fill{height:100%;background:var(--accent);transition:width .4s}
.tip{color:var(--muted);text-align:center;min-height:3em}
.boot-error pre{max-width:80vw;max-height:30vh;overflow:auto;white-space:pre-wrap;color:#f07b6b;font-size:.8em}
.boot-caps{position:absolute;bottom:1.2em;display:flex;gap:1.2em;color:var(--muted);font-size:.8em}
.credits-screen{justify-content:flex-start;padding-top:5vh}
.credits-body{width:min(52em,92vw);max-height:68vh;overflow:auto;padding:.6em 1.2em;border:1px solid var(--line);border-radius:10px;background:rgba(10,13,20,.6)}
.credit-list,.oss-list{list-style:none;padding:0;margin:0}
.credit-list li{display:flex;flex-direction:column;padding:.45em 0;border-bottom:1px solid rgba(255,255,255,.06)}
.credit-list small,.oss-list li{color:var(--muted);font-size:.82em;word-break:break-all}
.hud{pointer-events:none}
.help{position:absolute;left:12px;bottom:12px;max-width:min(30em,46vw);padding:.5em .7em;border-radius:8px;background:rgba(0,0,0,.42);
  display:grid;grid-template-columns:auto 1fr;gap:.2em .6em;font-size:.82em}
.help.collapsed{display:block}
.help-item{display:contents}
.help-item kbd{justify-self:start}
.prompt{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);padding:.4em 1em;border-radius:8px;background:rgba(20,40,90,.85);font-size:1.0em}
.notice{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);max-width:min(36em,90vw);padding:.55em 1.1em;border-radius:8px;
  background:rgba(90,40,20,.88);text-align:center}
.guide{position:absolute;left:50%;top:14px;transform:translateX(-50%);padding:.35em 1em;border-radius:8px;background:rgba(20,50,79,.88);
  border-bottom:3px solid var(--accent)}
.ui-root .ground-loading{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);padding:.3em .9em;border-radius:999px;background:rgba(0,0,0,.55);font-size:.85em}
.fade{position:absolute;inset:0;background:#000;pointer-events:none;transition:opacity .3s}
.hud-corner{position:absolute;top:12px;padding:.35em .8em;border-radius:8px;background:rgba(0,0,0,.38);text-shadow:0 0 3px rgba(0,0,0,.7);transition:opacity .8s}
.hud-place{left:12px;font-size:1.05em;font-weight:600;letter-spacing:.02em}
.hud-place:empty{display:none}
.hud-clock{right:12px;display:flex;gap:.7em;align-items:baseline}
.hud-clock .clock{font:600 1.25em/1 ui-monospace,monospace}
.idle{opacity:.22}
.help{transition:opacity .8s}
.gauge{position:absolute;right:226px;bottom:12px;min-width:13em;padding:.6em .9em;border-radius:10px;background:rgba(0,0,0,.5);font-size:.9em}
.gauge-main{display:flex;align-items:baseline;gap:.6em}
.gauge-speed{font:600 2.3em/1 system-ui,sans-serif}
.gauge-gear{margin-left:auto;font:600 1.4em system-ui}
.blink{color:#555;font-size:1.2em}
.blink.on{color:#3f3;animation:sanpo-blink .66s steps(1) infinite}
@keyframes sanpo-blink{50%{opacity:0}}
.rpm{height:5px;margin:.35em 0;border-radius:3px;background:#333}
.rpm-fill{height:5px;border-radius:3px;background:#7cf}
.rpm-fill.red{background:#f55}
.lamps{display:flex;flex-wrap:wrap;gap:.3em;font-size:.75em}
.lamp{padding:0 .4em;border-radius:3px;background:#333;color:#888}
.lamp.on.blue{background:#9df;color:#000}.lamp.on.amber{background:#fc4;color:#000}.lamp.on.red{background:#f66;color:#000}
.gauge-guide{display:flex;flex-wrap:wrap;gap:.6em;margin-top:.4em;font-size:.82em}
.gauge-guide .red{color:#f55}.gauge-guide .amber{color:#fd5}
.train-panel{position:absolute;right:226px;bottom:12px;padding:.5em .9em;border-radius:10px;background:rgba(0,0,0,.5)}
.train-line{color:var(--accent);font-size:.82em}
.minimap{position:absolute;right:12px;bottom:22px;width:200px;height:200px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,.85);
  box-shadow:0 2px 10px rgba(0,0,0,.45);transition:opacity .8s}
.minimap canvas{display:block}
.minimap .north{position:absolute;left:calc(50% - .5em);top:calc(50% - .7em);width:1em;text-align:center;font:700 .8em system-ui;color:#c92a2a;text-shadow:0 0 2px #fff}
.map-screen{flex-direction:row;align-items:stretch;justify-content:stretch;padding:0;gap:0;background:#101318}
.map-wrap{position:relative;flex:1;min-width:0}
.map-canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
.map-missing{position:absolute;top:45%;width:100%;text-align:center;color:var(--muted)}
.map-attribution{position:absolute;left:0;right:0;bottom:0;padding:.25em .6em;background:rgba(255,255,255,.82);color:#333;font-size:.75em}
.map-scale{position:absolute;left:12px;bottom:2.2em;color:#333;font-size:.75em;text-shadow:0 0 2px #fff}
.map-scale span{display:inline-block;height:6px;border:2px solid #333;border-top:0;margin-right:.4em;vertical-align:middle}
.map-side{width:min(22em,34vw);display:flex;flex-direction:column;gap:.5em;padding:1.2em;overflow:auto;background:rgba(14,18,26,.92)}
.map-side h2{margin:0}
.map-list{display:flex;flex-direction:column;gap:.35em}
.map-list h3{margin:.4em 0 .2em}
.btn.travel{display:flex;justify-content:space-between;align-items:baseline;gap:.6em;text-align:left;font-size:.92em}
.btn.travel small{color:var(--muted)}
.btn.travel.locked{opacity:.55}
.btn.travel.selected{border-color:var(--accent)}
.map-layers{display:grid;grid-template-columns:1fr auto;gap:.4em .8em;align-items:center;margin-top:.4em}
.log-screen{justify-content:flex-start;padding-top:4vh}
.log-screen h2 small{font-size:.6em;color:var(--muted);margin-left:.6em}
.log-body{display:flex;gap:1em;width:min(64em,94vw);height:58vh}
.log-grid{flex:1.2;display:grid;grid-template-columns:repeat(auto-fill,minmax(12em,1fr));gap:.4em;align-content:start;overflow:auto;padding:.2em}
.log-item{font:inherit;color:var(--muted);text-align:left;display:flex;gap:.5em;align-items:center;padding:.55em .7em;border-radius:8px;
  border:1px solid var(--line);background:var(--panel);cursor:pointer;outline:none}
.log-item.found{color:#fff}
.log-item small{margin-left:auto;color:var(--muted)}
.log-item:focus,.log-item:hover,.log-item.selected{border-color:var(--accent);background:rgba(240,138,36,.18)}
.log-item:focus{box-shadow:0 0 0 2px var(--accent)}
.log-icon{color:var(--accent);width:1.2em;text-align:center}
.log-detail{flex:1;padding:1em 1.2em;border:1px solid var(--line);border-radius:10px;background:rgba(10,13,20,.7);overflow:auto}
.log-detail h3{margin:.3em 0 .6em;font-size:1.35em}
.log-detail h4{margin:1em 0 .4em;color:var(--accent);font-size:.95em}
.log-cat{color:var(--accent);font-size:.85em}
.log-desc{line-height:1.7}
.photo-strip{display:flex;flex-wrap:wrap;gap:.4em}
.photo-strip img,.photo-missing{width:9em;height:5.1em;object-fit:cover;border-radius:6px;background:#222}
.screen.photo{pointer-events:none}
.photo-overlays,.photo-overlays>div{position:absolute;inset:0;pointer-events:none}
.photo-wb{mix-blend-mode:multiply;transition:opacity .2s}
.photo-vignette{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,var(--va,0)) 100%)}
.photo-grain{mix-blend-mode:overlay;background-repeat:repeat}
.photo-grid i{position:absolute;background:rgba(255,255,255,.5)}
.photo-grid i:nth-child(-n+2){top:0;bottom:0;width:1px}
.photo-grid i:nth-child(1){left:33.333%}.photo-grid i:nth-child(2){left:66.666%}
.photo-grid i:nth-child(n+3){left:0;right:0;height:1px}
.photo-grid i:nth-child(3){top:33.333%}.photo-grid i:nth-child(4){top:66.666%}
.screen.menu.photo-panel{inset:0 0 0 auto;width:min(25em,38vw);padding:1.1em;gap:.5em;justify-content:flex-start;align-items:stretch;background:rgba(14,18,26,.86);pointer-events:auto}
.photo-rows{overflow:auto;flex:1}
.photo-panel .row-control .choice,.photo-panel .row-control .slider{min-width:10.5em}
.photo-panel .nav-hint{position:static;margin-top:.3em}
.save-section{margin-top:1em;padding-top:.6em;border-top:1px solid var(--line)}
.save-section h3{margin:.2em 0}
.map-screen .nav-hint{left:0;right:auto;width:calc(100% - min(22em,34vw));color:#444;bottom:2.4em}
`;

export function injectTheme(doc: Document): void {
  if (doc.getElementById('sanpo-ui-theme')) return;
  const el = doc.createElement('style');
  el.id = 'sanpo-ui-theme';
  el.textContent = THEME_CSS;
  doc.head.append(el);
}
