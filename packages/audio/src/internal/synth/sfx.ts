// 합성 효과음(11 §2·§4, M09-T04 — ADR-0079): 개찰구 날개·카드 접촉·거부·역 차임·LCD 알림·문 차임·UI 클릭.
// 모두 자체 설계 음형 — 실제 역·사업자·브랜드 음(발차 멜로디·IC 개찰 "삑"·편의점 입점음 등)을 흉내 내지 않도록 음높이·리듬·음색을 다르게 고른다.
import { createRng } from '@sanpo/core';
import type { SfxId } from '../../api.ts';

/** 잡음 시작 위치용(소리 변화 — 결정론 필요 없음, 규칙 10에 따라 core rng). */
const rng = createRng(0x5f5);

interface Tone {
  t: number;
  dur: number;
  f: number;
  /** 사인 + 배음 비(0 = 순음). */
  bright: number;
  gain: number;
}

/** 음 목록(합성 정의 — 테스트가 길이·음역을 확인). 소음(날개·클릭)은 noise로. */
export const SFX_TONES: Readonly<
  Record<SfxId, { tones: Tone[]; noise?: { t: number; dur: number; hz: number; gain: number }[] }>
> = {
  // 날개 열림: 짧은 공기 쉭 + 둔탁한 멈춤(음 없음).
  gateOpen: {
    tones: [],
    noise: [
      { t: 0, dur: 0.16, hz: 1800, gain: 0.35 },
      { t: 0.15, dur: 0.05, hz: 300, gain: 0.6 },
    ],
  },
  gateClose: {
    tones: [],
    noise: [
      { t: 0, dur: 0.14, hz: 1500, gain: 0.3 },
      { t: 0.13, dur: 0.05, hz: 260, gain: 0.55 },
    ],
  },
  // 거부: 낮은 두 음 하강(경고 — 실제 기기 음과 다른 간격·음색).
  gateDenied: {
    tones: [
      { t: 0, dur: 0.16, f: 660, bright: 0.35, gain: 0.7 },
      { t: 0.2, dur: 0.24, f: 523, bright: 0.35, gain: 0.7 },
    ],
  },
  // 카드 접촉: 부드러운 완전5도 화음 한 번(짧은 단음 "삑"이 아니다).
  cardTouch: {
    tones: [
      { t: 0, dur: 0.11, f: 1175, bright: 0.1, gain: 0.45 },
      { t: 0, dur: 0.11, f: 1760, bright: 0.1, gain: 0.3 },
    ],
  },
  // 역 구내 차임(자체 작곡 3음 상행 — 안내방송 앞 신호음 대용, 멜로디 아님).
  stationChime: {
    tones: [
      { t: 0, dur: 0.5, f: 659, bright: 0.2, gain: 0.5 },
      { t: 0.28, dur: 0.5, f: 784, bright: 0.2, gain: 0.5 },
      { t: 0.56, dur: 0.9, f: 988, bright: 0.2, gain: 0.5 },
    ],
  },
  // 차내 LCD 알림: 두 음 하행 짧게.
  lcdChime: {
    tones: [
      { t: 0, dur: 0.22, f: 1319, bright: 0.05, gain: 0.35 },
      { t: 0.18, dur: 0.4, f: 1047, bright: 0.05, gain: 0.35 },
    ],
  },
  // 문 열림·닫힘 알림: 같은 음 세 번(간격 넓게).
  doorChime: {
    tones: [
      { t: 0, dur: 0.12, f: 880, bright: 0.25, gain: 0.4 },
      { t: 0.3, dur: 0.12, f: 880, bright: 0.25, gain: 0.4 },
      { t: 0.6, dur: 0.12, f: 880, bright: 0.25, gain: 0.4 },
    ],
  },
  uiClick: { tones: [{ t: 0, dur: 0.03, f: 2200, bright: 0, gain: 0.25 }] },
};

/** 재생 길이(s, 꼬리 포함). */
export function sfxDuration(id: SfxId): number {
  const d = SFX_TONES[id];
  let end = 0;
  for (const t of d.tones) end = Math.max(end, t.t + t.dur);
  for (const n of d.noise ?? []) end = Math.max(end, n.t + n.dur);
  return end + 0.15;
}

let noiseBuf: AudioBuffer | null = null;
function noiseOf(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = (s / 0x1_0000_0000) * 2 - 1;
  }
  return noiseBuf;
}

function env(g: AudioParam, at: number, dur: number, peak: number): void {
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(peak, at + Math.min(0.01, dur / 4));
  g.setTargetAtTime(0, at + dur * 0.6, dur * 0.25);
}

/** dest에 at(ctx 시각)부터 재생. pitch = 재생 속도 배율. */
export function playSfx(ctx: BaseAudioContext, id: SfxId, dest: AudioNode, at: number, gain = 1, pitch = 1): number {
  const d = SFX_TONES[id];
  for (const t of d.tones) {
    const o = ctx.createOscillator();
    o.type = t.bright > 0.2 ? 'triangle' : 'sine';
    o.frequency.value = t.f * pitch;
    const g = ctx.createGain();
    env(g.gain, at + t.t / pitch, t.dur / pitch, t.gain * gain);
    o.connect(g).connect(dest);
    o.start(at + t.t / pitch);
    o.stop(at + (t.t + t.dur) / pitch + 0.3);
  }
  for (const n of d.noise ?? []) {
    const src = ctx.createBufferSource();
    src.buffer = noiseOf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = n.hz * pitch;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    env(g.gain, at + n.t, n.dur, n.gain * gain);
    src.connect(f).connect(g).connect(dest);
    src.start(at + n.t, rng.next() * 0.5);
    src.stop(at + n.t + n.dur + 0.2);
  }
  return sfxDuration(id) / pitch;
}

export { noiseOf };
