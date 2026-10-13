// 야간 공유 유니폼(M09-T03 — ADR-0078): 밤 정도·파사드 클래스별 창 점등 비율·광원 밝기 배율. 파사드·HLOD·간판·소품 머티리얼이 같은 값을 읽는다(전역 — glass.ts interiorExposure와 같은 방식).
import { float, hash, mix, select, uniform, vec3 } from 'three/tsl';
import { type Node as TslNode, Vector3 } from 'three/webgpu';
import { type DayKind, nightOf, windowLitFractions } from './schedule.ts';

type F = TslNode<'float'>;

/** 밤 정도 0..1(태양 고도). */
export const nightU = uniform(0);
/** 창 점등 비율: A = (오피스, 맨션, 주택), B = (상업, 공공, 공업). */
export const litA = uniform(new Vector3(1, 1, 1));
export const litB = uniform(new Vector3(1, 1, 1));

/** 밤에 켜진 창의 실내 밝기 배율(낮 = 1)·꺼진 창(커튼 너머 어둠) — 실제 GPU 21:00 스크램블에서 조정. */
export const NIGHT_LIT_GAIN = 3.2;
export const NIGHT_OFF_GAIN = 0.06;

export function updateNight(sunY: number, gameMs: number, day: DayKind): void {
  nightU.value = nightOf(sunY);
  const f = windowLitFractions(gameMs, day);
  litA.value.set(f[0] ?? 1, f[1] ?? 1, f[2] ?? 1);
  litB.value.set(f[3] ?? 1, f[4] ?? 1, f[5] ?? 1);
}

/** 클래스(0–5) → 점등 비율 노드. */
export function litFractionOf(cls: F): F {
  return select(
    cls.lessThan(0.5),
    litA.x,
    select(
      cls.lessThan(1.5),
      litA.y,
      select(cls.lessThan(2.5), litA.z, select(cls.lessThan(3.5), litB.x, select(cls.lessThan(4.5), litB.y, litB.z))),
    ),
  );
}

/**
 * 창 하나의 실내 발광 배율(vec3 — 색온도 포함): 낮 1, 밤 = 켜짐(hash(창) < 비율) × NIGHT_LIT_GAIN × (주거 따뜻 / 사무 차가움), 꺼짐 NIGHT_OFF_GAIN.
 * cell = 정수 창 시드(windows.ts — 건물·층·베이), 같은 창은 비율이 내려갈 때 늘 같은 순서로 꺼진다(시드 결정론).
 */
export function windowNightGain(cls: F, cell: F): TslNode<'vec3'> {
  const lit = hash(cell.add(500_001)).lessThan(litFractionOf(cls));
  const home = cls.greaterThan(0.5).and(cls.lessThan(2.5));
  const warmth = hash(cell.add(700_003));
  const homeTint = select(warmth.lessThan(0.7), vec3(1, 0.8, 0.58), vec3(1, 0.93, 0.82));
  const tint = select(home, homeTint, select(warmth.lessThan(0.6), vec3(0.92, 0.97, 1), vec3(1, 0.96, 0.88)));
  const night = vec3(tint.mul(select(lit, float(NIGHT_LIT_GAIN), float(NIGHT_OFF_GAIN))));
  return mix(vec3(1), night, nightU);
}
