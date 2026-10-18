// 전체 지도(M) — M10-T03: 지도 캔버스(map/controller — 팬·줌·60 fps) + 빠른 이동 목록(발견한 곳만 이동 — 포커스하면 지도가 그곳으로) + 레이어(지명·역) + 출처 상시 표기.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TravelPlace, UiBridge } from '../../api.ts';
import { MenuButton, Toggle } from '../components/controls.tsx';
import { pick, t } from '../i18n/t.ts';
import { MapController } from '../map/controller.ts';
import { MenuScreen } from './menus.tsx';

function PlaceList(p: {
  bridge: UiBridge;
  onFocus: (pl: TravelPlace) => void;
  onGo: (pl: TravelPlace) => void;
  selected: string | null;
}) {
  const list = [...p.bridge.places.value].sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
  return (
    <div class="map-list">
      <h3>{t('map.travel')}</h3>
      {list.map((pl, i) => (
        <button
          key={pl.id}
          type="button"
          id={`travel-${pl.id}`}
          class={`btn travel ${pl.unlocked ? '' : 'locked'} ${p.selected === pl.id ? 'selected' : ''}`}
          data-nav
          data-autofocus={i === 0 ? '' : undefined}
          onFocus={() => p.onFocus(pl)}
          onClick={() => p.onGo(pl)}
        >
          <span>{pick(pl.name)}</span>
          <small>{pl.unlocked ? t(`map.kind.${pl.kind}`) : t('map.locked')}</small>
        </button>
      ))}
    </div>
  );
}

/** 지도 캔버스 키(WASD·Q/E·+/−) 누름 상태. */
function useMapKeys(ctl: MapController): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (/^Key[WASDQE]$|^Equal$|^Minus$/.test(e.code)) ctl.inp.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => ctl.inp.keys.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
}

function MapCanvas(p: { ctl: MapController; state: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (p.state !== 'ready' || !ref.current) return;
    p.ctl.start(ref.current);
    return () => p.ctl.stop();
  }, [p.state]);
  if (p.state !== 'ready')
    return <p class="map-missing">{t(p.state === 'missing' ? 'map.missing' : 'common.loading')}</p>;
  return (
    <canvas
      ref={ref}
      id="map-canvas"
      class="map-canvas"
      onWheel={(e) => p.ctl.wheel(e)}
      onPointerDown={(e) => p.ctl.drag(e, 'down')}
      onPointerMove={(e) => p.ctl.drag(e, 'move')}
      onPointerUp={(e) => p.ctl.drag(e, 'up')}
    />
  );
}

export function MapScreen(p: { bridge: UiBridge; back: () => void; pad: boolean; travel: (id: string) => void }) {
  const b = p.bridge;
  const ctl = useRef(new MapController(b)).current;
  const [layers, setLayers] = useState(ctl.layers);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => b.map.load(), []);
  useMapKeys(ctl);
  ctl.layers = layers;
  ctl.selected = selected;
  ctl.dirty = true;
  const focusPlace = (pl: TravelPlace) => {
    setSelected(pl.id);
    const m = b.worldToMap(pl.posWF);
    ctl.center(m.x, m.y);
  };
  const go = (pl: TravelPlace) => (pl.unlocked ? p.travel(pl.id) : setNote(t('map.lockedNote')));
  return (
    <MenuScreen id="map" class="map-screen" pad={p.pad}>
      <div class="map-wrap">
        <MapCanvas ctl={ctl} state={b.map.state.value} />
        <div class="map-attribution" id="map-attribution">
          {t('map.attribution')}
        </div>
        <div
          class="map-scale"
          ref={(el) => {
            ctl.scaleEl = el;
          }}
        >
          <span />
          {' '}
        </div>
      </div>
      <aside class="map-side">
        <h2>{t('map.title')}</h2>
        <p class="note">{t(p.pad ? 'map.controlsPad' : 'map.controls')}</p>
        <PlaceList bridge={b} onFocus={focusPlace} onGo={go} selected={selected} />
        {note ? <p class="note warn">{note}</p> : null}
        <div class="map-layers">
          <span>{t('map.layers.places')}</span>
          <Toggle id="map-layer-places" value={layers.places} onChange={(v) => setLayers({ ...layers, places: v })} />
          <span>{t('map.layers.rail')}</span>
          <Toggle id="map-layer-rail" value={layers.rail} onChange={(v) => setLayers({ ...layers, rail: v })} />
        </div>
        <MenuButton id="map-back" label={t('common.back')} variant="plain" onClick={p.back} />
      </aside>
    </MenuScreen>
  );
}
