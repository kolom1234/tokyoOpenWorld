// HLOD 건물 파사드(07 §3·§5, M12-T01): L0 절차 파사드(facade/*)를 단순화 원경 메시에 근사 — 원경 전환 때 색·창 크기가 이어지게.
// 입력 `_FACADE` = (class, floors, tintIdx, flags = 점등 단계 | 창 시드 << 4 — 05 §4 hlod.mesh), UV0 = 벽 미터(u 면 시작점부터, v 건물 바닥부터).
// 벽 = L0와 같은 레이어의 평균 알베도·ORM × 같은 팔레트(walls.ts) × 빗물 얼룩 평균. 창 = L0 클래스 표의 층고·베이·창 비(면 폭 맞춤은 없음).
// 낮 = 유리 색·블라인드·프레임 몫(glass.ts·windows.ts 값), 밤 = 같은 창 사각형이 점등 발광(M09-T03).
// 칸이 화소보다 작아지면(fwidth) 칸 판정 대신 기대값으로 섞는다(원경 반짝임 0). 밑동 = 지면 AO(L0와 같음) × 골목 하늘 가림.
import {
  abs,
  attribute,
  float,
  floor,
  fract,
  fwidth,
  hash,
  int,
  max,
  mix,
  normalWorld,
  select,
  smoothstep,
  step,
  uniformArray,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { litFractionOf, nightU } from '../lighting/night.ts';
import {
  type B,
  CURTAIN,
  type F,
  FACADE_CLASS,
  FACADE_CLASS_COUNT,
  FACADE_CLASS_TABLE,
  type V3,
  WINDOW_SILL,
} from './facade/grid.ts';
import { FRAME_COLOR } from './facade/index.ts';
import { wallFloor, wallLayer, wallTint } from './facade/walls.ts';
import { GLASS_TINT } from './facade/windows.ts';
import { BLIND_COLOR, glassRoughness } from './glass.ts';
import type { MaterialLibrary } from './library.ts';

/** 원경 야경 창 밝기 = L0 켜진 창과 맞춘 실제 GPU 값(M09-T03). */
export const HLOD_NIGHT_GAIN = 0.05;
/** HLOD `_FACADE`에는 커튼월 비트가 없다(flags = 점등 단계·창 시드) → 오피스 이 층수 이상만 커튼월(L0: 90 m 이상은 항상). */
export const HLOD_CURTAIN_MIN_FLOORS = 22;
/** 창 안 알루미늄 새시 면적 몫 — 7 cm 테 × 오피스 창 ≈ 1.5 × 2.1 m ≈ 15 %(금속도 0.7, 거칠기 0.4 — facade/index.ts). */
const FRAME_SHARE = 0.15;
/** L0 빗물 얼룩 평균 E[streak 0.5 × 높이 0.7 × 0.28](details.ts) → 알베도 배수 1 − 0.098. 커튼월은 0.3배. */
const DIRT_MEAN = 0.098;
/** L0 블라인드 평균 내림 비 E[min(1.4·h1·h2, 0.7)] ≈ 0.32(커튼월 0), 살 무늬 평균 밝기 0.94(glass.ts). */
const BLIND_MEAN = 0.32;
const SLAT_MEAN = 0.94;
/** 밤 창 원경 평균 = 점등 비율 × 창 면적 × 0.75(원경 대비 — M09-T03의 0.3 / 0.4). */
const NIGHT_FAR_K = 0.75;
/** 골목 하늘 가림: 벽 바닥 0.75 → 6 m 위 1(원경엔 화면공간 GTAO가 거의 닿지 않는다). 지면 0–1.2 m는 L0 details와 같음. */
const CANYON_AO_MIN = 0.75;
const CANYON_AO_M = 6;

export interface HlodFacadeNodes {
  color: V3;
  roughness: F;
  metalness: F;
  ao: F;
  emissive: V3;
}

interface FacadeAttr {
  cls: F;
  floors: F;
  tint: F;
  /** 점등 단계 0..15(05 §4 hlod.mesh). */
  level: F;
  seed: F;
}

interface HlodWindows {
  /** 정수 창 시드(건물·층·베이). */
  cell: F;
  /** 칸 안 창 사각형 0..1(주택 40 %는 0). */
  rect: F;
  /** 칸당 창 면적 비(기대값). */
  area: F;
  /** 0 = 칸 판정, 1 = 기대값(칸 ≤ 화소). */
  blur: F;
  curtain: B;
  /** 벽 1, 지붕(|ny| > 0.7 — L0 isRoof) 0. */
  wall: F;
}

const table = uniformArray<'vec4'>([...FACADE_CLASS_TABLE], 'vec4');
const glassA = vec3(...GLASS_TINT[0]);
const glassB = vec3(...GLASS_TINT[1]);

function facadeAttr(): FacadeAttr {
  const f = attribute('_facade', 'vec4').mul(255).add(0.5).floor();
  return { cls: f.x.min(FACADE_CLASS_COUNT - 1), floors: f.y, tint: f.z, level: f.w.mod(16), seed: floor(f.w.div(16)) };
}

const isClass = (cls: F, c: number): B => abs(cls.sub(c)).lessThan(0.5);

/** 1D 구간 a..b 마스크(가장자리 ±aa 부드럽게). */
function band(x: F, a: F, b: F, aa: F): F {
  return smoothstep(a.sub(aa), a.add(aa), x).mul(float(1).sub(smoothstep(b.sub(aa), b.add(aa), x)));
}

/** 창 격자·사각형(낮 유리와 밤 점등이 같은 칸·같은 사각형). 창 배치 = windows.ts layout(맨션 발코니 문 제외). */
function hlodWindows(a: FacadeAttr): HlodWindows {
  const p = vec4(table.element(int(a.cls)));
  const curtain = isClass(a.cls, FACADE_CLASS.office).and(a.floors.greaterThanEqual(HLOD_CURTAIN_MIN_FLOORS));
  const floorH = p.x;
  const bayW = select(curtain, float(CURTAIN.bayM), p.y);
  const cu = uv().x.div(bayW);
  const cv = uv().y.div(floorH);
  const cell = floor(cu).add(floor(cv).mul(1031)).add(a.seed.mul(7919)).add(a.tint.mul(104_729));
  const officeLike = isClass(a.cls, FACADE_CLASS.office).or(isClass(a.cls, FACADE_CLASS.public));
  const sill = select(officeLike, float(WINDOW_SILL.office), float(WINDOW_SILL.other));
  const x0 = select(curtain, float(CURTAIN.sideM).div(bayW), float(0.5).sub(p.z.mul(0.5)));
  const x1 = float(1).sub(x0);
  const y0 = select(curtain, float(CURTAIN.spandrelM).div(floorH), sill);
  const y1 = select(curtain, float(1).sub(float(CURTAIN.topM).div(floorH)), sill.add(p.w));
  const ax = fwidth(cu).max(1e-4);
  const ay = fwidth(cv).max(1e-4);
  const house = isClass(a.cls, FACADE_CLASS.house);
  const keep = select(house.and(hash(cell.add(0.5)).lessThan(0.4)), float(0), float(1));
  return {
    cell,
    rect: band(fract(cu), x0, x1, ax)
      .mul(band(fract(cv), y0, y1, ay))
      .mul(keep),
    area: x1
      .sub(x0)
      .mul(y1.sub(y0))
      .mul(select(house, float(0.6), float(1))),
    blur: smoothstep(0.35, 1, max(ax, ay)),
    curtain,
    wall: step(abs(normalWorld.y), 0.7),
  };
}

/** 낮 셰이딩: 벽(L0 레이어 평균) ↔ 창(유리 + 블라인드 + 프레임 몫)을 창 마스크로 섞는다. */
function dayShading(lib: MaterialLibrary, a: FacadeAttr, w: HlodWindows): Omit<HlodFacadeNodes, 'emissive'> {
  const isRoof = w.wall.lessThan(0.5);
  const layer = wallLayer(lib, int(a.cls), a.tint, isRoof);
  const orm = lib.avgOrm(layer);
  const dirt = select(w.curtain, float(DIRT_MEAN * 0.3), float(DIRT_MEAN));
  const wallAlbedo = wallFloor(lib.avgColor(layer).mul(wallTint(a.tint, isRoof))).mul(float(1).sub(dirt));
  const h1 = hash(w.cell.add(0.13));
  const h2 = hash(w.cell.add(0.29));
  const glass = mix(mix(glassA, glassB, h1).mul(h2.mul(0.5).add(0.75)), mix(glassA, glassB, 0.5), w.blur);
  const blindCell = select(w.curtain, float(0), h1.mul(h2).mul(1.4).min(0.7));
  const blind = mix(blindCell, select(w.curtain, float(0), float(BLIND_MEAN)), w.blur);
  const pane = mix(mix(glass, BLIND_COLOR.mul(SLAT_MEAN), blind), FRAME_COLOR, FRAME_SHARE);
  const paneRough = mix(mix(glassRoughness, float(0.75), blind), float(0.4), FRAME_SHARE);
  const m = mix(w.rect, w.area, w.blur).mul(w.wall);
  const v = uv().y;
  const groundAo = smoothstep(0, 1.2, v).mul(0.35).add(0.65);
  const canyonAo = smoothstep(0, CANYON_AO_M, v)
    .mul(1 - CANYON_AO_MIN)
    .add(CANYON_AO_MIN);
  return {
    color: mix(wallAlbedo, pane, m),
    roughness: mix(orm.y.add(dirt.mul(0.3)), paneRough, m),
    metalness: mix(orm.z, float(FRAME_SHARE * 0.7), m),
    ao: mix(orm.x, float(1), m).mul(mix(float(1), groundAo.mul(canyonAo), w.wall)),
  };
}

/** 밤 창 발광: 칸별 hash < 클래스 점등 비율 × (0.45 + 0.55 × 점등 단계/15). 원경 = 기대값(비율 × 면적 × 0.75). */
function nightEmissive(a: FacadeAttr, w: HlodWindows): V3 {
  const frac = litFractionOf(a.cls).mul(a.level.div(15).mul(0.55).add(0.45));
  const lit = step(hash(w.cell.add(0.37)), frac);
  const m = mix(lit.mul(w.rect), frac.mul(w.area).mul(NIGHT_FAR_K), w.blur);
  const warm = select(hash(w.cell.add(0.71)).lessThan(0.55), vec3(1, 0.78, 0.52), vec3(0.9, 0.95, 1));
  const tint = mix(vec3(0.85, 0.9, 1), warm, mix(float(1), float(0.5), w.blur));
  return tint.mul(m.mul(w.wall).mul(nightU).mul(HLOD_NIGHT_GAIN));
}

/** HLOD `facade_default`의 color·roughness·metalness·ao·emissive 노드. 머티리얼 1개(+ 페이드 변형) — 파이프라인 수 불변. */
export function hlodFacade(lib: MaterialLibrary): HlodFacadeNodes {
  const a = facadeAttr();
  const w = hlodWindows(a);
  return { ...dayShading(lib, a, w), emissive: nightEmissive(a, w) };
}
