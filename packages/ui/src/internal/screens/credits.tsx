// 크레딧: 데이터·에셋 출처(bridge.credits — 빌드 credits.json/ATTRIBUTION) + ODbL 안내 + 가상 디자인 고지 + OSS 라이선스 목록.
import { useEffect, useState } from 'preact/hooks';
import type { CreditsModel, UiBridge } from '../../api.ts';
import { MenuButton } from '../components/controls.tsx';
import { pick, t } from '../i18n/t.ts';
import { MenuScreen } from './menus.tsx';

export function CreditsScreen(p: { bridge: UiBridge; back: () => void; pad: boolean }) {
  const [c, setC] = useState<CreditsModel | null | 'error'>(null);
  useEffect(() => {
    let alive = true;
    p.bridge.credits().then(
      (m) => alive && setC(m),
      () => alive && setC('error'),
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <MenuScreen id="credits" class="credits-screen" focusKey={c === null ? 'loading' : 'ready'} pad={p.pad}>
      <h2>{t('credits.title')}</h2>
      <div class="credits-body" data-scroll>
        <p class="note">{t('credits.odbl')}</p>
        <p class="note">{t('credits.fictional')}</p>
        {c === null ? <p>{t('common.loading')}</p> : null}
        {c === 'error' ? <p class="warn">{t('credits.empty')}</p> : null}
        {c && c !== 'error' ? (
          <>
            {c.buildId ? <p class="note">{t('credits.build', { id: c.buildId })}</p> : null}
            <h3>{t('credits.data')}</h3>
            <ul class="credit-list" data-count={c.data.length}>
              {c.data.map((e) => (
                <li key={e.id} data-credit={e.id}>
                  <strong>{e.title}</strong>
                  {e.attribution ? <span>{pick(e.attribution)}</span> : null}
                  <small>
                    {t('credits.license')}: {e.license}
                    {e.url ? ' · ' : ''}
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noopener noreferrer">
                        {e.url}
                      </a>
                    ) : null}
                  </small>
                </li>
              ))}
            </ul>
            <h3>{t('credits.oss')}</h3>
            <ul class="oss-list" data-count={c.oss.length}>
              {c.oss.map((o) => (
                <li key={o.name}>
                  {o.name} {o.version} — {o.license}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div class="menu-row">
        <MenuButton id="credits-back" label={t('common.back')} autofocus onClick={p.back} />
      </div>
    </MenuScreen>
  );
}
