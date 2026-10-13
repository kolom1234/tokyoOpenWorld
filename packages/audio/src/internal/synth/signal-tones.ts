// 음향식 보행 신호 유도음(11 §2, M09-T04 — ADR-0079): 일본식 "새 울음(피요)·뻐꾸기(깍꾸)" 계열을 매개변수 합성.
// 실제 기기 녹음·재현이 아니라 자체 음형(주파수·길이·간격을 다르게) — 녹음 금지 범주(사용자 결정). 보행 W일 때만, F(점멸)·D면 멈춘다.

export type TonePattern = 'chirp' | 'cuckoo';

/** 음 하나: 시작(s, 주기 안)·길이(s)·주파수 시작→끝(Hz)·상대 이득. */
export interface ToneNote {
  t: number;
  dur: number;
  f0: number;
  f1: number;
  gain: number;
}

export interface ToneCycle {
  periodS: number;
  notes: ToneNote[];
}

/**
 * chirp(주 도로 방향): "삐-요" 두 음(상승 짧게 → 하강 길게) 0.9 s 주기.
 * cuckoo(교차 방향): 두 음 하강(높은 짧은 음 → 낮은 긴 음) 1.6 s 주기.
 * 그룹 코드 짝수 = chirp, 홀수 = cuckoo(같은 교차로의 직교 방향이 서로 다른 소리).
 */
export function toneCycle(p: TonePattern): ToneCycle {
  if (p === 'chirp')
    return {
      periodS: 0.9,
      notes: [
        { t: 0, dur: 0.06, f0: 2650, f1: 3150, gain: 0.8 },
        { t: 0.085, dur: 0.12, f0: 3150, f1: 2450, gain: 1 },
      ],
    };
  return {
    periodS: 1.6,
    notes: [
      { t: 0, dur: 0.17, f0: 1320, f1: 1300, gain: 1 },
      { t: 0.32, dur: 0.38, f0: 1060, f1: 1040, gain: 0.85 },
    ],
  };
}

export function patternOfCode(code: number): TonePattern {
  return (code & 3) % 2 === 0 ? 'chirp' : 'cuckoo';
}

/** [from, to) 구간(초, 절대 시각)에 시작하는 음들 — 오디오 스케줄러가 미리 예약할 때. 위상 = 코드별 고정(같은 신호기는 같은 박자). */
export function notesBetween(p: TonePattern, code: number, from: number, to: number): { at: number; note: ToneNote }[] {
  const c = toneCycle(p);
  const phase = ((code * 0.137) % 1) * c.periodS;
  const out: { at: number; note: ToneNote }[] = [];
  const k0 = Math.floor((from - phase) / c.periodS) - 1;
  for (let k = k0; ; k++) {
    const base = phase + k * c.periodS;
    if (base >= to) break;
    for (const n of c.notes) {
      const at = base + n.t;
      if (at >= from && at < to) out.push({ at, note: n });
    }
  }
  return out;
}
