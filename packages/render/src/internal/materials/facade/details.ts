// 절차 파사드 ⑤ 디테일(07 §5-8): 층간 줄눈(슬래브 띠), 빗물 얼룩(상단→하단 그라디언트 × 가로 저주파 노이즈), 지면 AO, 모서리 AO, 옥상 두겁 띠.
// 배수관·실외기 데칼은 M05-T07(옥상·파사드 디테일).
import { abs, float, fract, hash, max, min, mix, select, smoothstep } from 'three/tsl';
import type { F, FacadeGrid, FacadeInputs } from './grid.ts';
import { FACADE_CLASS } from './grid.ts';

export interface FacadeDetails {
  /** 알베도 배수(얼룩·줄눈). */
  albedoMul: F;
  /** 앰비언트 차폐(0..1). */
  ao: F;
  /** 거칠기 가산. */
  roughAdd: F;
}

/** 가로 1D 값 노이즈(0..1, 부드러운 보간) — 줄 단위 얼룩. */
function noise1(x: F): F {
  const i = x.floor();
  const f = fract(x);
  const w = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(hash(i), hash(i.add(1)), w);
}

export function facadeDetails(i: FacadeInputs, g: FacadeGrid): FacadeDetails {
  // 슬래브 띠: 층 바닥 0–0.18 m(주택·커튼월 제외). 약간 밝게(콘크리트 노출).
  const slabBand = select(
    i.cls.equal(FACADE_CLASS.house).or(i.curtain).or(g.isGround),
    float(0),
    float(1).sub(smoothstep(0.12, 0.2, g.ly)),
  );
  // 빗물 얼룩: 창 아래·상단에서 흘러내린 세로 줄 — 높이에 따라 약해진다.
  const streak = noise1(i.u.mul(2.3).add(i.tint));
  const fromTop = smoothstep(0, 1, i.bldgH.sub(i.v).div(max(i.bldgH, 1)).oneMinus());
  const dirt = streak
    .mul(fromTop.mul(0.6).add(0.4))
    .mul(0.28)
    .mul(select(i.curtain, float(0.3), float(1)));
  // 지면 AO(바닥 0–1.2 m)·모서리 AO(면 양끝 0.4 m).
  const groundAo = smoothstep(0, 1.2, i.v).mul(0.35).add(0.65);
  const cornerDist = min(i.u, i.faceW.sub(i.u));
  const cornerAo = smoothstep(0, 0.4, cornerDist).mul(0.25).add(0.75);
  const parapet = smoothstep(i.bldgH.sub(0.25), i.bldgH.sub(0.2), i.v);
  const albedoMul = float(1).sub(dirt).add(slabBand.mul(0.12)).add(parapet.mul(0.1));
  return {
    albedoMul,
    ao: select(i.isRoof, float(1), groundAo.mul(select(i.faceW.greaterThan(1), cornerAo, float(1)))),
    roughAdd: dirt.mul(0.3).add(abs(slabBand).mul(0.05)),
  };
}
