// 지형 성형(M05-T01, 04 §4.3): 셀 + 여유 1 m 창에서 국소 연산만 — 이웃 셀과 공유하는 샘플은 같은 입력 → 같은 값(04 §6).
// 도로·보행 샘플 기준면 D = 도로 마스크 5×5 평균(DEM 1 m 잡음·기존 연석 제거). 차도 = D + 횡단경사 2 %(가장자리에서 거리 × 0.02, ≤ 0.15 m),
// 보행면 윗면 S = D + 0.15(연석). 지형 G: 보행 샘플은 바깥(비도로) 1.5 m 띠 = S(보도 메시 가장자리와 지형이 만남), 나머지 = D(보도 메시가 덮음,
// 연석 앞 경사 없음). 바깥 가장자리 정밀 맞춤은 edge-burn.ts(벡터 조각). 비도로 샘플은 가장 가까운 도로 면 높이로 1.5 m까지 맞추고 4 m까지 원 DEM으로 섞는다. 건물 발자국 안(가장자리 1.5 m 안쪽) = 건물 최저점.
// 허용 오차(RTIN): 보행·비도로 경계 둘레 2.5 m = 3 mm, 차도의 보행 둘레 2 m = 1 cm, 나머지(보도 안쪽 포함) 5 cm.
import { discOffsets, distOf, type LocalGrid, maskedBoxMean, nearestIn } from './grid.ts';
import { ROAD_CLASS } from './roads.ts';

/** 창 여유(m): 가장 먼 국소 연산(비도로 섞기 4 m + 보행 판정 1.5 m + 평균 2 m + 여유) — 셀 경계 샘플이 이웃과 같은 입력을 본다. */
export const SHAPE_PAD = 16;
export const CURB_M = 0.15;
export const CROSSFALL = 0.02;
export const CROWN_MAX_M = 0.15;
const BLUR_R = 2;
const BAND_M = 1.5;
const FADE_M = 4;
const FLAT_INSET_M = 1.5;
const FLAT_MAX_M = 1;
export const TOL_TIGHT_M = 0.003;
const TOL_NEAR_M = 0.01;
export const TOL_DEFAULT_M = 0.05;
const TIGHT_AROUND_WALK_M = 2.5;
const NEAR_ROAD_M = 2;

export interface ShapedGround {
  grid: LocalGrid;
  /** 지형·높이장 높이(m). */
  ground: Float32Array;
  /** 기준면 D(도로·보행), 비도로 = DEM. 연석 아래 끝 기준. */
  base: Float32Array;
  /** 보행면 윗면(보도 메시 높이): 보행·도로 = D + 0.15, 비도로 = 가장 가까운 보행 윗면(4 m 안, 없으면 DEM + 0.15). */
  top: Float32Array;
  /** 도로 분류 래스터(ROAD_CLASS). */
  cls: Uint8Array;
  /** RTIN 허용 오차(m). */
  tol: Float32Array;
}

function maskOf(cls: Uint8Array, pred: (c: number) => boolean): Uint8Array {
  return cls.map((c) => (pred(c) ? 1 : 0));
}

/** 가장 가까운 mask 샘플과 거리(없으면 ∞). */
function near(n: number, k: number, mask: Uint8Array, r: number): { k: number; d: number } {
  const t = nearestIn(n, k % n, Math.floor(k / n), mask, discOffsets(r));
  return t < 0 ? { k: -1, d: Number.POSITIVE_INFINITY } : { k: t, d: distOf(n, k, t) };
}

interface Masks {
  road: Uint8Array;
  walk: Uint8Array;
  none: Uint8Array;
  paved: Uint8Array;
}

/** 도로·보행 샘플의 면 높이(차도 = D + 경사, 보행 = D + 연석)와 지형 G(보행 띠 규칙). */
function pavedSurfaces(n: number, cls: Uint8Array, base: Float32Array, m: Masks) {
  const surf = Float32Array.from(base);
  const ground = Float32Array.from(base);
  const notRoad = m.walk.map((w, k) => (w === 1 || m.none[k] === 1 ? 1 : 0));
  for (let k = 0; k < n * n; k++) {
    const d = base[k] as number;
    if (cls[k] === ROAD_CLASS.road) {
      const e = near(n, k, notRoad, CROWN_MAX_M / CROSSFALL).d;
      surf[k] = d + Math.min(e * CROSSFALL, CROWN_MAX_M);
      ground[k] = surf[k] as number;
    } else if (cls[k] === ROAD_CLASS.walk) {
      surf[k] = d + CURB_M;
      const outer = near(n, k, m.none, BAND_M).d <= BAND_M;
      // 바깥 띠만 윗면 S(가장자리에서 지형과 만남), 안쪽·연석 띠 = D(보도 메시가 15 cm 위에서 덮는다 — 4 m 조각 곡률 오차 흡수).
      ground[k] = outer ? d + CURB_M : d;
    }
  }
  return { surf, ground };
}

/**
 * 비도로 샘플: 가장 가까운 도로·보행 면 높이로 BAND_M까지 맞추고 FADE_M까지 DEM으로 섞는다 — 보행면이 BAND_M 안이면 보행면 우선
 * (보도 끝이 차도 가까이 있는 모서리에서 가장자리 치마와 지형이 15 cm 어긋나지 않게). top = 가장 가까운 보행 윗면.
 */
function blendOffRoad(
  n: number,
  dem: Float32Array,
  m: Masks,
  surf: Float32Array,
  ground: Float32Array,
  top: Float32Array,
) {
  for (let k = 0; k < n * n; k++) {
    if (m.none[k] !== 1) continue;
    const w0 = near(n, k, m.walk, BAND_M);
    const p = w0.k >= 0 ? w0 : near(n, k, m.paved, FADE_M);
    const h = dem[k] as number;
    if (p.k >= 0) {
      const w = Math.min(Math.max((FADE_M - p.d) / (FADE_M - BAND_M), 0), 1);
      ground[k] = h + w * ((surf[p.k] as number) - h);
    } else ground[k] = h;
    top[k] = planeFit(n, k, m.walk, surf) ?? h + CURB_M;
  }
}

/** 보행면 윗면 외삽 반경(m) — 비도로 샘플 쪽으로 가장자리 높이를 이어 준다. */
const FIT_R = 3;

/**
 * k 둘레 FIT_R 안 보행 샘플 윗면(surf)의 가중 평면 맞춤(w = 1/(1 + d²))을 k에서 평가. 가장 가까운 샘플 값을 쓰면 급경사(12 %)에서
 * 이웃 비도로 샘플끼리 10–15 cm 계단이 생겨 보도 가장자리와 지형이 어긋났다. 표본 3개 미만·특이하면 가중 평균, 없으면 undefined.
 */
function planeFit(n: number, k: number, walk: Uint8Array, surf: Float32Array): number | undefined {
  const i0 = k % n;
  const j0 = Math.floor(k / n);
  let [sw, sx, sz, sxx, sxz, szz, sh, sxh, szh] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const offs = discOffsets(FIT_R);
  for (let t = 0; t < offs.d.length; t++) {
    const dx = offs.di[t] as number;
    const dz = offs.dj[t] as number;
    const [i, j] = [i0 + dx, j0 + dz];
    if (i < 0 || j < 0 || i >= n || j >= n || walk[j * n + i] !== 1) continue;
    const w = 1 / (1 + (offs.d[t] as number) ** 2);
    const h = surf[j * n + i] as number;
    sw += w;
    sx += w * dx;
    sz += w * dz;
    sxx += w * dx * dx;
    sxz += w * dx * dz;
    szz += w * dz * dz;
    sh += w * h;
    sxh += w * dx * h;
    szh += w * dz * h;
  }
  if (sw === 0) return undefined;
  // 정규방정식 [sw sx sz; sx sxx sxz; sz sxz szz]·[a b c] = [sh sxh szh], 평가점 = 원점(dx = dz = 0) → a.
  const det = sw * (sxx * szz - sxz * sxz) - sx * (sx * szz - sxz * sz) + sz * (sx * sxz - sxx * sz);
  if (Math.abs(det) < 1e-6 * sw * sw * sw) return sh / sw;
  const a = (sh * (sxx * szz - sxz * sxz) - sx * (sxh * szz - sxz * szh) + sz * (sxh * sxz - sxx * szh)) / det;
  return a;
}

/**
 * 건물 발자국 안쪽 비도로 샘플 = 건물 지면 최저점(flatY, NaN = 발자국 밖). 발자국 밖·포장면에서 FLAT_INSET_M 이상 들어간 샘플만,
 * 성형 높이와 FLAT_MAX_M 넘게 다르면 그대로(도로 위 데크·지하 모델링 지면이 구덩이를 만들지 않게).
 */
function flattenBuildings(n: number, m: Masks, flatY: Float32Array, ground: Float32Array): void {
  const open = Uint8Array.from(flatY, (v, k) => (Number.isNaN(v) || m.paved[k] === 1 ? 1 : 0));
  for (let k = 0; k < n * n; k++) {
    if (m.none[k] !== 1 || open[k] === 1) continue;
    const y = flatY[k] as number;
    if (Math.abs(y - (ground[k] as number)) > FLAT_MAX_M) continue;
    if (near(n, k, open, FLAT_INSET_M).k >= 0) continue;
    ground[k] = y;
  }
}

function tolerances(n: number, m: Masks): Float32Array {
  const tol = new Float32Array(n * n).fill(TOL_DEFAULT_M);
  for (let k = 0; k < n * n; k++) {
    // 보행 샘플은 바깥 띠(비도로 둘레)만 3 mm — 안쪽은 보도 메시가 15 cm 위에서 덮어 5 cm면 충분(가장자리 새기기가 벡터 띠를 다시 조인다).
    if (m.walk[k] === 1) tol[k] = near(n, k, m.none, TIGHT_AROUND_WALK_M).k >= 0 ? TOL_TIGHT_M : TOL_DEFAULT_M;
    else if (m.none[k] === 1 && near(n, k, m.walk, TIGHT_AROUND_WALK_M).k >= 0) tol[k] = TOL_TIGHT_M;
    else if (m.road[k] === 1 && near(n, k, m.walk, NEAR_ROAD_M).k >= 0) tol[k] = TOL_NEAR_M;
  }
  return tol;
}

/** 성형: dem·cls·flatY는 같은 창(grid.n²). */
export function shapeGround(grid: LocalGrid, dem: Float32Array, cls: Uint8Array, flatY: Float32Array): ShapedGround {
  const { n } = grid;
  const masks: Masks = {
    road: maskOf(cls, (c) => c === ROAD_CLASS.road),
    walk: maskOf(cls, (c) => c === ROAD_CLASS.walk),
    none: maskOf(cls, (c) => c === ROAD_CLASS.none),
    paved: maskOf(cls, (c) => c !== ROAD_CLASS.none),
  };
  const base = maskedBoxMean(dem, masks.paved, n, BLUR_R);
  const { surf, ground } = pavedSurfaces(n, cls, base, masks);
  const top = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) top[k] = (base[k] as number) + CURB_M;
  blendOffRoad(n, dem, masks, surf, ground, top);
  flattenBuildings(n, masks, flatY, ground);
  return { grid, ground, base, top, cls, tol: tolerances(n, masks) };
}
