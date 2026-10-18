// HUD 정보(M10-T02, 12 §2): 왼쪽 위 지명, 오른쪽 위 시각(JST)·날씨·기온, 탈것 계기(속도·기어·RPM·등화·안내), 열차 다음 역.
// 무입력 5 s면 지명·시각·도움말이 흐려진다(설정 "HUD 숨기기" — 안내·알림·계기는 그대로).
import { useEffect, useState } from 'preact/hooks';
import type { DriveModel, HudModel, SettingsModel, TrainModel } from '../../api.ts';
import { pick, t } from '../i18n/t.ts';

const IDLE_MS = 5000;
const WEATHER_ICON: Readonly<Record<string, string>> = {
  clear: '☀',
  partly: '⛅',
  cloudy: '☁',
  overcast: '☁',
  drizzle: '🌦',
  rain: '🌧',
  heavy: '🌧',
  fog: '🌫',
  snow: '❄',
};

/** 게임 시각 → JST HH:MM. */
export function jstClock(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function speedText(kmh: number, units: SettingsModel['units']): { value: string; unit: string } {
  return units === 'imperial'
    ? { value: String(Math.round(kmh * 0.621371)), unit: 'mph' }
    : { value: String(Math.round(kmh)), unit: 'km/h' };
}

/** 마지막 입력(키·마우스·패드 — HUD 위치·시선 변화 포함) 뒤 IDLE_MS가 지나면 true. */
export function useIdle(enabled: boolean, activity: unknown): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }
    let timer = setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const evs = ['keydown', 'mousemove', 'mousedown', 'wheel'] as const;
    for (const e of evs) window.addEventListener(e, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of evs) window.removeEventListener(e, wake);
    };
  }, [enabled, activity]);
  return idle;
}

function Gauge(p: { d: DriveModel; units: SettingsModel['units'] }) {
  const d = p.d;
  const sp = speedText(d.speedKmh, p.units);
  const lamp = (on: boolean, key: string, cls: string) => <span class={`lamp ${on ? `on ${cls}` : ''}`}>{t(key)}</span>;
  const limit = d.limitKmh === null ? null : speedText(d.limitKmh, p.units);
  return (
    <div id="sanpo-drive" class="gauge" role="status" data-kind={d.kind}>
      <div class="gauge-main">
        <span class={`blink ${d.indicator === -1 ? 'on' : ''}`}>◀</span>
        <span class="gauge-speed">{sp.value}</span>
        <span class="gauge-unit">{sp.unit}</span>
        {d.kind === 'sedan' ? <span class="gauge-gear">{d.gear}</span> : null}
        <span class={`blink ${d.indicator === 1 ? 'on' : ''}`}>▶</span>
      </div>
      {d.kind === 'sedan' ? (
        <div class="rpm">
          <div class={`rpm-fill ${d.rpm > 0.85 ? 'red' : ''}`} style={{ width: `${Math.round(d.rpm * 100)}%` }} />
        </div>
      ) : null}
      <div class="lamps">
        {lamp(d.lights, 'hud.drive.lights', 'blue')}
        {d.kind === 'sedan' ? lamp(d.abs, 'hud.drive.abs', 'amber') : null}
        {d.kind === 'sedan' ? lamp(d.tcs, 'hud.drive.tcs', 'amber') : null}
        {lamp(d.braking, 'hud.drive.braking', 'red')}
        {lamp(d.aeb, 'hud.drive.aeb', 'red')}
      </div>
      <div class="gauge-guide">
        {limit ? (
          <span class={d.speedKmh > (d.limitKmh ?? 0) + 10 ? 'warn' : ''}>
            {t('hud.drive.limit', { n: `${limit.value} ${limit.unit}` })}
          </span>
        ) : null}
        {d.stop ? (
          <span class={d.stop.lamp === 'R' ? 'red' : 'amber'}>
            ● {t('hud.drive.stopLine', { d: Math.round(d.stop.distM) })}
          </span>
        ) : null}
        {d.wrongWay ? <span class="warn">{t('hud.drive.wrongWay')}</span> : null}
        {d.sidewalk ? <span class="amber">{t('hud.drive.sidewalk')}</span> : null}
      </div>
    </div>
  );
}

function TrainPanel(p: { tr: TrainModel }) {
  const tr = p.tr;
  return (
    <div id="sanpo-train" class="train-panel" role="status">
      <div class="train-line">{pick(tr.line)}</div>
      {tr.stopped ? (
        <div>{t('hud.train.stopped', { station: tr.stopped })}</div>
      ) : tr.next ? (
        <div>
          {t('hud.train.next', { station: tr.next })}
          {tr.arrivalInS !== null ? (
            <small> · {t('hud.train.inMin', { n: Math.max(1, Math.round(tr.arrivalInS / 60)) })}</small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function HudInfo(p: { hud: HudModel; settings: SettingsModel; idle: boolean }) {
  const h = p.hud;
  return (
    <>
      <div class={`hud-corner hud-place ${p.idle ? 'idle' : ''}`} id="sanpo-place">
        {h.place ? pick(h.place) : ''}
      </div>
      <div class={`hud-corner hud-clock ${p.idle ? 'idle' : ''}`} id="sanpo-clock">
        <span class="clock">{jstClock(h.timeMs)}</span>
        <span class="weather" title={t(`weather.${h.weather}`)}>
          {WEATHER_ICON[h.weather] ?? ''} {t(`weather.${h.weather}`)}
        </span>
        {h.tempC !== null ? (
          <span class="temp">
            {p.settings.units === 'imperial' ? `${Math.round(h.tempC * 1.8 + 32)}°F` : `${Math.round(h.tempC)}°C`}
          </span>
        ) : null}
      </div>
      {h.drive ? <Gauge d={h.drive} units={p.settings.units} /> : null}
      {h.train && !h.drive ? <TrainPanel tr={h.train} /> : null}
    </>
  );
}
