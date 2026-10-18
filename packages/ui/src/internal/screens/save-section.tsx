// 설정 → 일반 → 세이브(M10-T06): 내보내기(JSON 다운로드 — 세이브·설정·사진 썸네일)·가져오기(파일 고르기 — 키보드·패드는 버튼이 숨은 file input을 연다).
import { useRef, useState } from 'preact/hooks';
import type { UiBridge } from '../../api.ts';
import { MenuButton } from '../components/controls.tsx';
import { t } from '../i18n/t.ts';

export function SaveSection(p: { bridge: UiBridge }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const doExport = async () => {
    try {
      const b = await p.bridge.commands.exportSave();
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tokyo-sanpo-save-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(t('save.exported'));
    } catch (e) {
      setNote(t('save.failed', { e: String(e) }));
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      await p.bridge.commands.importSave(f);
      setNote(t('save.imported'));
    } catch {
      setNote(t('save.invalid'));
    }
  };
  return (
    <div class="save-section">
      <h3>{t('settings.saveTitle')}</h3>
      <p class="note">{t('save.hint')}</p>
      <div class="menu-row">
        <MenuButton id="save-export" label={t('save.export')} onClick={() => void doExport()} />
        <MenuButton id="save-import" label={t('save.import')} onClick={() => input.current?.click()} />
      </div>
      <input
        ref={input}
        id="save-file"
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void onFile((e.currentTarget as HTMLInputElement).files?.[0])}
      />
      {note ? (
        <p class="note" id="save-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
