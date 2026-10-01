// 발 높이 스무딩(ADR-0044 → M05-T08 ADR-0056): 비탈 끝에서 몇 프레임 뜰 때 카메라 높이 연속(스냅 없음), 공중엔 몸과 함께, 착지 파고듦 ≤ 3 cm, 순간이동 스냅.
import { describe, expect, it } from 'vitest';
import { createFirstPersonState, followFeet } from '../src/internal/camera/first-person-rig.ts';

const DT = 1 / 60;
const W = 12;

describe('followFeet', () => {
  it('비탈(0.72 m/s 상승) 위 지연 뒤 4프레임 공중(계속 상승) → 프레임당 높이 변화 ≤ 몸 이동 + 4 mm(스냅·속도 튐 없음)', () => {
    const s = createFirstPersonState();
    let y = 10;
    let cam = followFeet(s, y, true, DT, W);
    for (let i = 0; i < 120; i++) {
      y += 0.72 * DT;
      cam = followFeet(s, y, true, DT, W);
    }
    expect(y - cam).toBeGreaterThan(0.08); // 스프링 지연 ≈ 2v/ω
    const steps: boolean[] = [false, false, false, false, true, true, true, true];
    for (const g of steps) {
      y += 0.72 * DT;
      const next = followFeet(s, y, g, DT, W);
      expect(Math.abs(next - cam)).toBeLessThan(0.72 * DT + 0.004);
      cam = next;
    }
  });

  it('낙하(공중 1 s): 카메라가 몸과 함께 움직이고 오프셋이 쌓이지 않는다', () => {
    const s = createFirstPersonState();
    let y = 30;
    followFeet(s, y, true, DT, W);
    let vy = 0;
    for (let i = 0; i < 60; i++) {
      vy -= 9.81 * DT;
      y += vy * DT;
      const cam = followFeet(s, y, false, DT, W);
      expect(Math.abs(cam - y)).toBeLessThan(1e-9);
    }
  });

  it('낙하 뒤 착지: 낙하 속도를 넘기지 않아 카메라가 몸 아래로 3 cm 넘게 파고들지 않는다', () => {
    const s = createFirstPersonState();
    let y = 30;
    followFeet(s, y, true, DT, W);
    let vy = 0;
    for (let i = 0; i < 30; i++) {
      vy -= 9.81 * DT;
      y += vy * DT;
      followFeet(s, y, false, DT, W);
    }
    let low = 0;
    for (let i = 0; i < 60; i++) low = Math.min(low, followFeet(s, y, true, DT, W) - y);
    expect(low).toBeGreaterThan(-0.031);
  });

  it('0.6 m 넘는 변화(순간이동)는 즉시', () => {
    const s = createFirstPersonState();
    followFeet(s, 0, true, DT, W);
    expect(followFeet(s, 5, true, DT, W)).toBe(5);
  });
});
