// 도감(M10-T04, 12 §2 Discovery Log): 분류 탭(전체·랜드마크·거리·공원·신사·전망), 명소 격자(미발견 = ???), 고르면 오른쪽에 이름·설명(자체 작성 3개 언어)·발견 시각(JST)·날씨·사진.
import { useState } from 'preact/hooks';
import type { DiscoveryModel, PoiCategory, UiBridge } from '../../api.ts';
import { MenuButton } from '../components/controls.tsx';
import { pick, t } from '../i18n/t.ts';
import { jstClock } from './hud-info.tsx';
import { MenuScreen } from './menus.tsx';

const CATS: readonly ('all' | PoiCategory)[] = ['all', 'landmark', 'street', 'park', 'shrine', 'view'];
const ICON: Readonly<Record<PoiCategory, string>> = { landmark: '◆', street: '▤', park: '♣', shrine: '⛩', view: '◎' };

/** 게임 시각 → JST 날짜. */
export function jstDate(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function Detail(p: { d: DiscoveryModel | undefined; bridge: UiBridge }) {
  const d = p.d;
  if (!d) return <div class="log-detail" />;
  const found = d.discoveredAtMs !== null;
  return (
    <div class="log-detail" id="log-detail" data-found={found ? '1' : '0'}>
      <div class="log-cat">
        {ICON[d.category]} {t(`log.cat.${d.category}`)}
      </div>
      <h3>{found ? pick(d.name) : t('log.unknown')}</h3>
      {found ? (
        <>
          <p class="log-desc">{pick(d.description)}</p>
          <p class="note">
            {t('log.discoveredAt', {
              date: jstDate(d.discoveredAtMs as number),
              time: jstClock(d.discoveredAtMs as number),
              weather: t(`weather.${d.weather ?? 'clear'}`),
            })}
          </p>
          <h4>{t('log.photos')}</h4>
          {d.photoIds.length === 0 ? (
            <p class="note">{t('log.noPhotos')}</p>
          ) : (
            <PhotoStrip ids={d.photoIds} bridge={p.bridge} />
          )}
        </>
      ) : (
        <p class="note">{t('log.unknownHint')}</p>
      )}
    </div>
  );
}

/** 사진 썸네일(포토 모드 — T05가 bridge.photoUrl을 채운다). */
function PhotoStrip(p: { ids: readonly string[]; bridge: UiBridge }) {
  return (
    <div class="photo-strip">
      {p.ids.map((id) => {
        const src = p.bridge.photoUrl?.(id);
        return src ? <img key={id} src={src} alt="" /> : <span key={id} class="photo-missing" />;
      })}
    </div>
  );
}

export function LogScreen(p: { bridge: UiBridge; back: () => void; pad: boolean }) {
  const all = p.bridge.discoveries.value;
  const [cat, setCat] = useState<'all' | PoiCategory>('all');
  const [sel, setSel] = useState<string | null>(all[0]?.id ?? null);
  const list = all.filter((d) => cat === 'all' || d.category === cat);
  const found = all.filter((d) => d.discoveredAtMs !== null).length;
  return (
    <MenuScreen id="log" class="log-screen" focusKey={cat} pad={p.pad}>
      <h2>
        {t('log.title')} <small id="log-count">{t('log.count', { n: found, total: all.length })}</small>
      </h2>
      <div class="tabs" role="tablist">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            id={`log-tab-${c}`}
            class={`tab ${c === cat ? 'active' : ''}`}
            data-nav
            data-autofocus={c === cat ? '' : undefined}
            onClick={() => setCat(c)}
          >
            {t(`log.cat.${c}`)}
          </button>
        ))}
      </div>
      <div class="log-body">
        <div class="log-grid" data-scroll>
          {list.map((d) => (
            <button
              key={d.id}
              type="button"
              id={`log-${d.id}`}
              class={`log-item ${d.discoveredAtMs !== null ? 'found' : ''} ${sel === d.id ? 'selected' : ''}`}
              data-nav
              onFocus={() => setSel(d.id)}
              onClick={() => setSel(d.id)}
            >
              <span class="log-icon">{ICON[d.category]}</span>
              <span>{d.discoveredAtMs !== null ? pick(d.name) : t('log.unknown')}</span>
              {d.photoIds.length ? <small>📷 {d.photoIds.length}</small> : null}
            </button>
          ))}
        </div>
        <Detail d={all.find((d) => d.id === sel)} bridge={p.bridge} />
      </div>
      <div class="menu-row">
        <MenuButton id="log-back" label={t('common.back')} onClick={p.back} />
      </div>
    </MenuScreen>
  );
}
