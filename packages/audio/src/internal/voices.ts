// 3D 보이스 풀(11 §1 sfxBus): PannerNode(HRTF, inverse, ref 2 m, rolloff 1.2) — 동시 32개 상한, 넘치면 우선순위(이득 ÷ 거리²) 최저를 빼앗는다.
// 가려짐(11 §1): 보이스마다 로우패스 — 가려졌으면 1.2 kHz, 아니면 20 kHz(램프).
import type { Vec3d } from '@sanpo/core';

export const MAX_VOICES = 32;
export const OCCLUDED_HZ = 1200;
const OPEN_HZ = 20_000;

export interface VoiceInfo {
  id: number;
  priority: number;
}

/** 가장 낮은 우선순위 보이스 id(새 소리가 그보다 낮으면 null — 새 소리를 버린다). */
export function chooseVictim(voices: readonly VoiceInfo[], incoming: number): number | null {
  let worst: VoiceInfo | null = null;
  for (const v of voices) if (!worst || v.priority < worst.priority) worst = v;
  return worst && worst.priority < incoming ? worst.id : null;
}

export function priorityOf(gain: number, posWF: Vec3d, listener: Vec3d): number {
  const d2 = (posWF.x - listener.x) ** 2 + (posWF.y - listener.y) ** 2 + (posWF.z - listener.z) ** 2;
  return gain / Math.max(1, d2);
}

export interface Voice {
  id: number;
  /** 소리 노드를 여기에 연결. */
  input: AudioNode;
  panner: PannerNode;
  filter: BiquadFilterNode;
  setPosition(p: Vec3d, origin: Vec3d): void;
  setOccluded(on: boolean): void;
  release(): void;
}

export interface VoicePool {
  /** 실패(우선순위 밀림) = null. endAt = ctx 시각 — 그때 자동 해제. */
  acquire(posWF: Vec3d, gain: number, endAt: number): Voice | null;
  active(): number;
}

function makeVoice(ctx: AudioContext, out: AudioNode, id: number, onRelease: (id: number) => void): Voice {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = OPEN_HZ;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.rolloffFactor = 1.2;
  panner.maxDistance = 400;
  filter.connect(panner).connect(out);
  return {
    id,
    input: filter,
    panner,
    filter,
    setPosition(p, o) {
      const t = ctx.currentTime;
      panner.positionX.setValueAtTime(p.x - o.x, t);
      panner.positionY.setValueAtTime(p.y - o.y, t);
      panner.positionZ.setValueAtTime(p.z - o.z, t);
    },
    setOccluded(on) {
      filter.frequency.setTargetAtTime(on ? OCCLUDED_HZ : OPEN_HZ, ctx.currentTime, 0.15);
    },
    release() {
      onRelease(id);
      filter.disconnect();
      panner.disconnect();
    },
  };
}

/** origin = 리스너 좌표 원점(WF → 오디오 좌표 = WF − origin, float32 정밀도). */
export function createVoicePool(
  ctx: AudioContext,
  out: AudioNode,
  listener: () => Vec3d,
  origin: () => Vec3d,
): VoicePool {
  const live = new Map<number, { voice: Voice; priority: number; endAt: number }>();
  let next = 1;
  const sweep = () => {
    const now = ctx.currentTime;
    for (const { voice, endAt } of [...live.values()]) if (endAt < now) voice.release();
  };
  return {
    acquire(posWF, gain, endAt) {
      sweep();
      const pr = priorityOf(gain, posWF, listener());
      if (live.size >= MAX_VOICES) {
        const victim = chooseVictim(
          [...live.values()].map((l) => ({ id: l.voice.id, priority: l.priority })),
          pr,
        );
        if (victim === null) return null;
        live.get(victim)?.voice.release();
      }
      const v = makeVoice(ctx, out, next++, (id) => live.delete(id));
      v.setPosition(posWF, origin());
      live.set(v.id, { voice: v, priority: pr, endAt });
      return v;
    },
    active: () => {
      sweep();
      return live.size;
    },
  };
}
