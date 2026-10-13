// 앰비언스 베드 재생(11 §2): 베드마다 루프 AudioBufferSourceNode + GainNode. 목표 이득은 setTargetAtTime(τ 0.8 s)으로만 바꾼다
// → 존 경계·시간대 변화에 계단·클릭이 없다. 새 소스는 이득 0에서 시작(페이드 인), 0이 20 s 이어지면 멈추고 해제.
import type { AssetStore } from './assets.ts';
import type { BedGains, BedId } from './mixer.ts';

export const BED_TAU_S = 0.8;
/** 이 이득 아래는 "꺼짐". */
const SILENT = 0.002;
const IDLE_STOP_S = 20;

interface Bed {
  gain: GainNode;
  src: AudioBufferSourceNode | null;
  target: number;
  silentSince: number;
}

export interface BedPlayer {
  /** 목표 이득 반영(호출 간격 자유 — 10 Hz면 충분). rand = 시작 위치(0..1). */
  update(g: BedGains, rand: () => number): void;
  audible(): BedId[];
  dispose(): void;
}

export function createBedPlayer(ctx: AudioContext, out: AudioNode, send: AudioNode, assets: AssetStore): BedPlayer {
  const beds = new Map<BedId, Bed>();
  const bedOf = (id: BedId): Bed => {
    let b = beds.get(id);
    if (!b) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      gain.connect(send);
      b = { gain, src: null, target: 0, silentSince: ctx.currentTime };
      beds.set(id, b);
    }
    return b;
  };
  const start = (b: Bed, buf: AudioBuffer, rand: () => number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(b.gain);
    src.start(ctx.currentTime, rand() * buf.duration);
    b.src = src;
  };
  const stop = (b: Bed) => {
    b.src?.stop();
    b.src?.disconnect();
    b.src = null;
  };
  return {
    update(g, rand) {
      const now = ctx.currentTime;
      for (const [id, v] of Object.entries(g) as [BedId, number][]) {
        if (v <= SILENT && !beds.has(id)) continue;
        const b = bedOf(id);
        if (v > SILENT && !b.src) {
          const buf = assets.buffer(id);
          if (buf) start(b, buf, rand);
        }
        if (Math.abs(v - b.target) > 1e-4) b.gain.gain.setTargetAtTime(v, now, BED_TAU_S);
        b.target = v;
        if (v > SILENT) b.silentSince = now;
        else if (b.src && now - b.silentSince > IDLE_STOP_S) stop(b);
      }
    },
    audible: () => [...beds.entries()].filter(([, b]) => b.src && b.target > 0.01).map(([id]) => id),
    dispose() {
      for (const b of beds.values()) {
        stop(b);
        b.gain.disconnect();
      }
      beds.clear();
    },
  };
}
