// 나무 계절 표(M05-T04, 07 §8): dayOfYear(JST) → 수종별 잎 색(선형 RGB)·잎 밀도(0 = 낙엽, 1 = 무성).
// 은행 황엽 11/15–12/10(11/1부터 물듦), 벚꽃 3/25–4/8(꽃 = 분홍, 뒤 새잎), 느티 갈색 11월, 겨울 낙엽수 가지만, 녹나무·소나무·관목 상록. see ADR-0052
import { Color } from 'three/webgpu';

/** 수종 번호(TREE_SPECIES) 1–6 → 표 인덱스. 0은 비워 둔다. */
export const SPECIES_SLOTS = 7;

const lin = (hex: number): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

export const BARK_COLORS: readonly (readonly [number, number, number])[] = [
  lin(0x5a5048),
  lin(0x6e6457), // 은행
  lin(0x8a8378), // 느티(회백색 매끈)
  lin(0x4d3a33), // 벚(짙은 가로 줄)
  lin(0x5e5348), // 녹나무
  lin(0x5a4535), // 소나무
  lin(0x4a3d30), // 관목
];

const GREEN = {
  ginkgo: lin(0x6f9a3a),
  zelkova: lin(0x5d8a3a),
  cherry: lin(0x5f8f3d),
  camphor: lin(0x4a7a32),
  pine: lin(0x3b5f2f),
  shrub: lin(0x4f7d35),
};
const YELLOW = lin(0xe8c440);
const RUST = lin(0xb5652e);
const PINK = lin(0xf3c6d3);
const RED = lin(0xc0502e);
const SPRING = lin(0x9cc456);

const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => {
  const k = Math.min(Math.max(t, 0), 1);
  return [0, 1, 2].map((i) => (a[i] as number) + ((b[i] as number) - (a[i] as number)) * k) as [number, number, number];
};
/** d가 [a, b]에서 0 → 1. */
const ramp = (d: number, a: number, b: number): number => Math.min(Math.max((d - a) / (b - a), 0), 1);

interface Leaf {
  color: [number, number, number];
  density: number;
}

/** 낙엽 활엽수 공통: 봄 새잎(sprout) → 여름 → 단풍(turn: 시작·완료) → 낙엽(fall: 시작·끝). */
function deciduous(
  d: number,
  summer: readonly number[],
  autumn: readonly number[],
  k: { sprout: [number, number]; turn: [number, number]; fall: [number, number] },
): Leaf {
  if (d < k.sprout[0] || d >= k.fall[1]) return { color: mix(summer, autumn, 1), density: 0 };
  if (d < k.sprout[1])
    return {
      color: mix(SPRING, summer, ramp(d, k.sprout[0], k.sprout[1]) * 0.5),
      density: ramp(d, k.sprout[0], k.sprout[1]),
    };
  if (d < k.turn[0])
    return { color: mix(SPRING, summer, 0.5 + ramp(d, k.sprout[1], k.sprout[1] + 30) * 0.5), density: 1 };
  return { color: mix(summer, autumn, ramp(d, k.turn[0], k.turn[1])), density: 1 - ramp(d, k.fall[0], k.fall[1]) };
}

function cherry(d: number): Leaf {
  // 꽃(분홍, 잎 없음) 3/25–4/8 → 새잎 → 여름 → 붉은 단풍 11월 → 낙엽.
  if (d >= 80 && d < 99) return { color: PINK, density: ramp(d, 80, 84) * (1 - ramp(d, 96, 99)) * 0.85 + 0.15 };
  return deciduous(d, GREEN.cherry, RED, { sprout: [97, 115], turn: [300, 322], fall: [325, 340] });
}

/** dayOfYear(1–366) → 표 [slot × 4] = (r, g, b, density). */
export function seasonTable(dayOfYear: number): Float32Array {
  const d = dayOfYear;
  const rows: Leaf[] = [
    { color: GREEN.camphor, density: 1 },
    deciduous(d, GREEN.ginkgo, YELLOW, { sprout: [85, 110], turn: [305, 319], fall: [344, 356] }),
    deciduous(d, GREEN.zelkova, RUST, { sprout: [90, 115], turn: [305, 320], fall: [335, 350] }),
    cherry(d),
    { color: GREEN.camphor, density: 1 },
    { color: GREEN.pine, density: 1 },
    { color: GREEN.shrub, density: 1 },
  ];
  const out = new Float32Array(SPECIES_SLOTS * 4);
  for (const [i, r] of rows.entries()) out.set([...r.color, r.density], i * 4);
  return out;
}
