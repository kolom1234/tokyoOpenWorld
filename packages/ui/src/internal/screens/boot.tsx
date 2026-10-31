// 부팅·로딩 화면: 로고, 단계(기능 → 월드 → 셰이더 → 출발 지역), 진행 막대, 팁(8 s마다), WebGPU·격리 상태, 오류, 점검(킬 스위치 — ADR-0104).
import { useEffect, useState } from 'preact/hooks';
import type { LoadingModel } from '../../api.ts';
import { t, tm } from '../i18n/t.ts';

const TIPS = 6;
const TIP_MS = 8000;

export function BootScreen(p: { loading: LoadingModel }) {
  const l = p.loading;
  const [tip, setTip] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setTip((n) => (n % TIPS) + 1), TIP_MS);
    return () => clearInterval(id);
  }, []);
  const err = l.stage === 'error';
  const maintenance = l.stage === 'maintenance';
  return (
    <div class="screen boot" data-screen="boot">
      <div class="boot-center">
        <h1 class="logo">
          TOKYO SANPO<span>{t('app.name')}</span>
        </h1>
        <div class="boot-stage" data-stage={l.stage}>
          {t(`boot.stage.${l.stage}`)}
          {l.detail ? <span class="boot-detail"> · {tm(l.detail)}</span> : null}
        </div>
        {err || maintenance ? null : (
          <div class="progress">
            <div class="progress-fill" style={{ width: `${Math.round(Math.min(1, l.progress) * 100)}%` }} />
          </div>
        )}
        {maintenance ? (
          <div class="boot-maintenance">
            <p>{t('boot.maintenanceHint')}</p>
          </div>
        ) : err ? (
          <div class="boot-error">
            <p>{t('boot.errorHint')}</p>
            <pre>{l.error}</pre>
          </div>
        ) : (
          <p class="tip">{t(`boot.tip.${tip}`)}</p>
        )}
      </div>
      <div class="boot-caps">
        {l.webgpu === null ? null : <span>{t(l.webgpu ? 'boot.gpu.webgpu' : 'boot.gpu.webgl')}</span>}
        {l.isolated === false ? <span class="warn">{t('boot.isolated.off')}</span> : null}
      </div>
    </div>
  );
}
