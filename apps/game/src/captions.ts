// 효과음 자막(M11-T04 — 12 §6): AudioService를 감싸 중요 효과음(역·문·차내 차임, 개찰구, 자전거 벨)을 낼 때 HUD 자막(shell/hud-state)을 민다.
// 위치 소리는 듣는 사람 30 m 안만, 같은 자막은 2 s 안에 다시 내지 않는다. 표시 여부는 UI 설정(captions)이 정한다.
import type { AudioService, SfxId } from '@sanpo/audio';
import type { Vec3d } from '@sanpo/core';
import type { Msg } from '@sanpo/ui';

const CAPTION_KEY: Partial<Record<SfxId, string>> = {
  stationChime: 'caption.stationChime',
  doorChime: 'caption.doorChime',
  lcdChime: 'caption.lcdChime',
  cardTouch: 'caption.gate',
  gateDenied: 'caption.gateDenied',
  bicycleBell: 'caption.bicycleBell',
};
const NEAR_M = 30;
const REPEAT_MS = 2000;

export function withCaptions(audio: AudioService, push: (m: Msg) => void, now = () => performance.now()): AudioService {
  let listener: Vec3d | null = null;
  const last = new Map<string, number>();
  const caption = (id: SfxId, pos?: Vec3d) => {
    const key = CAPTION_KEY[id];
    if (!key) return;
    if (pos && listener && Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z) > NEAR_M) return;
    const t = now();
    if (t - (last.get(key) ?? Number.NEGATIVE_INFINITY) < REPEAT_MS) return;
    last.set(key, t);
    push({ key });
  };
  return new Proxy(audio, {
    get(target, prop, recv) {
      if (prop === 'setListener')
        return (cam: Parameters<AudioService['setListener']>[0], groundY?: number) => {
          listener = { ...cam.posWF };
          target.setListener(cam, groundY);
        };
      if (prop === 'playAt')
        return (id: SfxId, pos: Vec3d, o?: { gain?: number; pitch?: number }) => {
          caption(id, pos);
          target.playAt(id, pos, o);
        };
      if (prop === 'playUi')
        return (id: SfxId) => {
          caption(id);
          target.playUi(id);
        };
      return Reflect.get(target, prop, recv);
    },
  });
}
