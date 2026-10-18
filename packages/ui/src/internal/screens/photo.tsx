// 포토 모드(P) — M10-T05, 12 §5: 자유 카메라(WASD·E/Q·마우스 끌기)로 구도, 오른쪽 패널 = 시간(±12 h)·날씨·노출·화이트밸런스·초점 거리(mm)·조리개·초점(오른쪽 클릭)·비네팅·그레인·3분할·배율(×1/×2),
// 셔터 = 원본 캡처 → 그레이딩 합성 → PNG 다운로드 + 썸네일 도감 연결. 미리보기 = CSS 층(같은 값). HUD는 숨김.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PhotoParams, UiBridge } from '../../api.ts';
import { Choice, MenuButton, Row, Slider, Toggle } from '../components/controls.tsx';
import { t } from '../i18n/t.ts';
import { css, gradePhoto, grainAlpha, noiseDataUrl, vignetteAlpha, wbColor } from '../photo/grade.ts';
import { MenuScreen } from './menus.tsx';

export const DEFAULT_PHOTO: PhotoParams = {
  timeOffsetH: 0,
  weather: null,
  exposureEv: 0,
  whiteBalance: 0,
  focalMm: 35,
  aperture: 22,
  focusM: null,
  vignette: 0.2,
  grain: 0,
  grid: true,
  hideHud: true,
};
const WEATHERS = ['keep', 'clear', 'partly', 'cloudy', 'rain', 'fog', 'snow'] as const;
const APERTURES = ['1.4', '2', '2.8', '4', '5.6', '8', '11', '22'] as const;

function Overlays(p: { ph: PhotoParams }) {
  const grain = useMemo(() => noiseDataUrl(), []);
  const wb = wbColor(p.ph.whiteBalance);
  return (
    <div class="photo-overlays" aria-hidden="true">
      <div class="photo-wb" style={{ background: css(wb), opacity: Math.abs(p.ph.whiteBalance) > 0.01 ? 1 : 0 }} />
      <div class="photo-vignette" style={{ '--va': String(vignetteAlpha(p.ph.vignette)) }} />
      <div class="photo-grain" style={{ backgroundImage: `url(${grain})`, opacity: String(grainAlpha(p.ph.grain)) }} />
      {p.ph.grid ? (
        <div class="photo-grid">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}
    </div>
  );
}

type NumKey = 'timeOffsetH' | 'exposureEv' | 'whiteBalance' | 'focalMm' | 'vignette' | 'grain';
interface SliderSpec {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}
const signed = (v: number, d: number, u: string) => `${v > 0 ? '+' : ''}${v.toFixed(d)}${u}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const SLIDERS: Readonly<Record<NumKey, SliderSpec>> = {
  timeOffsetH: {
    key: 'timeOffsetH',
    label: 'photo.time',
    min: -12,
    max: 12,
    step: 0.25,
    fmt: (v) => signed(v, 2, ' h'),
  },
  exposureEv: {
    key: 'exposureEv',
    label: 'photo.exposure',
    min: -3,
    max: 3,
    step: 0.1,
    fmt: (v) => signed(v, 1, ' EV'),
  },
  whiteBalance: { key: 'whiteBalance', label: 'photo.wb', min: -1, max: 1, step: 0.05, fmt: (v) => signed(v, 2, '') },
  focalMm: { key: 'focalMm', label: 'photo.focal', min: 14, max: 200, step: 1, fmt: (v) => `${v} mm` },
  vignette: { key: 'vignette', label: 'photo.vignette', min: 0, max: 1, step: 0.05, fmt: pct },
  grain: { key: 'grain', label: 'photo.grain', min: 0, max: 1, step: 0.05, fmt: pct },
};

type PanelProps = { ph: PhotoParams; set: (q: Partial<PhotoParams>) => void };

function NumRow(p: PanelProps & { k: NumKey }) {
  const sp = SLIDERS[p.k];
  return (
    <Row label={t(sp.label)}>
      <Slider
        id={`photo-${p.k}`}
        value={p.ph[p.k]}
        min={sp.min}
        max={sp.max}
        step={sp.step}
        format={sp.fmt}
        onChange={(v) => p.set({ [p.k]: v })}
      />
    </Row>
  );
}

function LensRows(p: PanelProps) {
  const ph = p.ph;
  return (
    <>
      <NumRow {...p} k="focalMm" />
      <Row label={t('photo.aperture')} hint={t('photo.apertureHint')}>
        <Choice
          id="photo-aperture"
          value={String(ph.aperture) as (typeof APERTURES)[number]}
          options={APERTURES.map((a) => ({ value: a, label: a === '22' ? t('photo.dofOff') : `f/${a}` }))}
          onChange={(a) => p.set({ aperture: Number(a), focusM: ph.focusM ?? 20 })}
        />
      </Row>
      <Row label={t('photo.focus')} hint={t('photo.focusHint')}>
        <Slider
          id="photo-focus"
          value={ph.focusM ?? 20}
          min={1}
          max={300}
          step={1}
          format={(v) => `${v} m`}
          onChange={(focusM) => p.set({ focusM })}
        />
      </Row>
    </>
  );
}

function Panel(p: PanelProps & { scale: 1 | 2; setScale: (s: 1 | 2) => void }) {
  const ph = p.ph;
  return (
    <>
      <NumRow {...p} k="timeOffsetH" />
      <Row label={t('photo.weather')}>
        <Choice
          id="photo-weather"
          value={ph.weather ?? 'keep'}
          options={WEATHERS.map((w) => ({
            value: w,
            label: w === 'keep' ? t('photo.weatherKeep') : t(`weather.${w}`),
          }))}
          onChange={(w) => p.set({ weather: w === 'keep' ? null : w })}
        />
      </Row>
      <NumRow {...p} k="exposureEv" />
      <NumRow {...p} k="whiteBalance" />
      <LensRows ph={ph} set={p.set} />
      <NumRow {...p} k="vignette" />
      <NumRow {...p} k="grain" />
      <Row label={t('photo.grid')}>
        <Toggle value={ph.grid} onChange={(grid) => p.set({ grid })} />
      </Row>
      <Row label={t('photo.scale')}>
        <Choice
          id="photo-scale"
          value={String(p.scale) as '1' | '2'}
          options={[
            { value: '1', label: '×1' },
            { value: '2', label: '×2 (4K)' },
          ]}
          onChange={(v) => p.setScale(v === '2' ? 2 : 1)}
        />
      </Row>
    </>
  );
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 오른쪽 클릭 = 그 점에 초점(게임이 물리 레이로 거리). */
function useFocusPick(b: UiBridge, set: (q: Partial<PhotoParams>) => void): void {
  useEffect(() => {
    const canvas = document.getElementById('view');
    if (!canvas) return;
    const h = (e: MouseEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      void b.commands.pickFocus((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height).then((d) => {
        if (d !== null) set({ focusM: Math.max(1, Math.min(300, Math.round(d))) });
      });
    };
    canvas.addEventListener('contextmenu', h);
    return () => canvas.removeEventListener('contextmenu', h);
  }, []);
}

/** 셔터: 원본 캡처 → 그레이딩 합성 → PNG 다운로드 → 썸네일 보관(도감 연결). */
async function shootPhoto(
  b: UiBridge,
  scale: 1 | 2,
  ph: PhotoParams,
  setBusy: (v: boolean) => void,
  setNote: (v: string) => void,
): Promise<void> {
  setBusy(true);
  setNote('');
  try {
    const raw = await b.commands.takePhoto(scale);
    const g = await gradePhoto(raw, ph);
    download(g.full, `tokyo-sanpo-${Date.now()}.png`);
    const r = await b.commands.storePhoto(g.thumb);
    setNote(
      r.poiName ? t('photo.savedPoi', { w: g.w, h: g.h, name: r.poiName }) : t('photo.saved', { w: g.w, h: g.h }),
    );
  } catch (e) {
    setNote(t('photo.failed', { e: String(e) }));
  } finally {
    setBusy(false);
  }
}

export function PhotoScreen(p: { bridge: UiBridge; back: () => void; pad: boolean }) {
  const b = p.bridge;
  const [ph, setPh] = useState<PhotoParams>(DEFAULT_PHOTO);
  const [scale, setScale] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const phRef = useRef(ph);
  phRef.current = ph;
  const set = (q: Partial<PhotoParams>) => setPh((cur) => ({ ...cur, ...q }));
  useEffect(() => {
    if (!b.commands.setPhotoParams(phRef.current)) p.back();
    return () => {
      b.commands.setPhotoParams(null);
    };
  }, []);
  useEffect(() => {
    b.commands.setPhotoParams(ph);
  }, [ph]);
  useFocusPick(b, set);
  const shoot = () => void shootPhoto(b, scale, phRef.current, setBusy, setNote);
  return (
    <div class="screen photo" data-screen="photo">
      <Overlays ph={ph} />
      <MenuScreen id="photo" class="photo-panel" pad={p.pad}>
        <h2>{t('photo.title')}</h2>
        <p class="note">{t(p.pad ? 'photo.controlsPad' : 'photo.controls')}</p>
        <div class="photo-rows" data-scroll>
          <Panel ph={ph} set={set} scale={scale} setScale={setScale} />
        </div>
        <div class="menu-row">
          <MenuButton
            id="photo-shutter"
            label={busy ? t('photo.busy') : t('photo.shutter')}
            disabled={busy}
            autofocus
            onClick={shoot}
          />
          <MenuButton id="photo-back" label={t('common.back')} variant="plain" onClick={p.back} />
        </div>
        {note ? (
          <p class="note" id="photo-note">
            {note}
          </p>
        ) : null}
      </MenuScreen>
    </div>
  );
}
