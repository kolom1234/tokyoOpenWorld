// 랜드마크 오버라이드 명세(M05-T05): content/overrides/<id>/meta.json — 대체할 PLATEAU 건물(replace)의 면을 랜드마크 머티리얼로 다시 내보내고(shell)
// 절차 부품(parts)을 더한다. 좌표 = WF(m), 부품 y = 그 자리 지면 기준(yAbs가 있으면 WF 절대). 로고·글자·상표 없음(03 §5). see ADR-0053
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceKind } from '../../../readers/plateau/types.ts';

/** `_LMAT` 값 — packages/render `materials/landmark.ts` 표와 같은 순서. */
export const LMAT = {
  concrete: 0,
  stone: 1,
  curtain: 2,
  clear_glass: 3,
  metal: 4,
  deck: 5,
  wood: 6,
  vermilion: 7,
  screen: 8,
  bronze: 9,
  steel_dark: 10,
  granite_grid: 11,
  gravel: 12,
  fin_curtain: 13,
  green: 14,
  /** 옥상 물탱크 FRP(M05-T07). */
  frp: 15,
} as const;
export type LmatName = keyof typeof LMAT;

export type XZ = [number, number];

export interface ShellRule {
  kinds?: SurfaceKind[];
  /** true = 벽(|n.y| < 0.7)만, false = 수평에 가까운 면만. */
  wall?: boolean;
  /** 면 중심 높이(건물 바닥 기준, m) 범위 [lo, hi). */
  y?: [number, number];
  mat: LmatName;
}

export interface ShellSpec {
  gml: string;
  /** true = PLATEAU 면을 내지 않는다(붙은 부품 — 예: 현수 지붕 — 이 건물을 대신한다). */
  skip?: boolean;
  /** 벽을 이 높이(건물 바닥 기준, m)에서 수평으로 자른다 — 높이 띠별 머티리얼. */
  cuts?: number[];
  /** 앞에서부터 처음 맞는 규칙. 없으면 concrete. */
  rules: ShellRule[];
}

interface PartBase {
  mat: LmatName;
  /** 정적 콜라이더(박스·원기둥 근사)를 함께 낸다. */
  collide?: boolean;
  /** 바닥 높이: 지면 + y(기본 0). */
  y?: number;
  /** 바닥 높이를 WF 절대값으로. */
  yAbs?: number;
}

export interface BoxPart extends PartBase {
  type: 'box';
  at: XZ;
  /** (로컬 x 폭, 높이, 로컬 z 깊이) m. */
  size: [number, number, number];
  /** +Y축 회전(도). */
  yaw?: number;
}

export interface CylPart extends PartBase {
  type: 'cyl';
  at: XZ;
  r: number;
  rTop?: number;
  h: number;
  seg?: number;
}

export interface ExtrudePart extends PartBase {
  type: 'extrude';
  /** WF xz 링(닫힘 점 반복 없음). */
  ring: number[];
  h: number;
}

export interface CurbPart extends PartBase {
  type: 'curb';
  /** 닫힌 링(화단 테두리 등) WF xz — 중심선. */
  path: number[];
  /** 높이·두께(m). */
  h: number;
  w: number;
}

export interface RailingPart extends PartBase {
  type: 'railing';
  path: number[];
  closed?: boolean;
  h?: number;
  /** 난간 사이 유리판(머티리얼 clear_glass). */
  glass?: boolean;
}

export interface RibbonPart extends PartBase {
  type: 'ribbon';
  /** 지면에 덮는 띠(참도 자갈 등) 중심선 WF xz. */
  path: number[];
  width: number;
}

export interface ScreenPart extends PartBase {
  type: 'screen';
  /** 붙일 건물 — 이 건물이 있는 셀이 낸다(대체 여부 무관). */
  gml: string;
  /** 화면 양끝(WF xz) — 건물 벽 평면에 투영해 바깥으로 띄운다. */
  from: XZ;
  to: XZ;
  /** 화면 아래·위(건물 바닥 기준, m). */
  span: [number, number];
  /** 가상 영상 시드(0..63). */
  seed: number;
}

export interface TentPart extends PartBase {
  type: 'tent';
  /** 발자국을 쓰는 건물(셸 skip과 함께). */
  gml: string;
  /** 주 케이블 능선 양끝(기둥) WF xz — 같은 점이면 기둥 하나(원뿔형). */
  spine: [number, number, number, number];
  /** 처마(둘레 링)·능선 끝 높이·능선 가운데 처짐·기둥 높이(건물 바닥 기준 m), 기둥 지름. */
  eave: number;
  ridge: number;
  sag: number;
  mast: number;
  mastD: number;
}

export interface ToriiPart extends PartBase {
  type: 'torii';
  /** 가사기(맨 위 가로대) 양끝 WF xz — 중심·방향·길이. */
  a: XZ;
  b: XZ;
  /** 지면 ~ 가사기 위 높이(m). */
  height: number;
  /** 기둥 중심 간격(m). */
  span: number;
  /** 기둥 지름(m). */
  pillarD: number;
}

export interface DogPart extends PartBase {
  type: 'dog';
  at: XZ;
  /** 개가 보는 방향(도, 0 = −Z 북쪽, 시계 방향 +). */
  facing: number;
  /** 앉은 키(받침 위 귀 끝까지, m). */
  height: number;
}

export type PartSpec =
  | BoxPart
  | CylPart
  | ExtrudePart
  | CurbPart
  | RailingPart
  | RibbonPart
  | ScreenPart
  | TentPart
  | ToriiPart
  | DogPart;

export interface LandmarkSpec {
  id: string;
  /** 목록 순서(M05-T05 Do). */
  order: number;
  name: { ja: string; en: string };
  /** 렌더에서 대체할 PLATEAU 건물 gmlId — 충돌·meta에는 남는다. */
  replace: string[];
  shell: ShellSpec[];
  parts: PartSpec[];
  /** 치수·위치 출처(검증 근거). */
  reference: { source: string; note?: string }[];
}

export interface OverrideSet {
  landmarks: LandmarkSpec[];
  /** gmlId → (랜드마크, 셸 명세). */
  shells: Map<string, { lm: LandmarkSpec; shell: ShellSpec }>;
}

const DEFAULT_RULES: ShellRule[] = [{ mat: 'concrete' }];

export function overrideSetOf(landmarks: LandmarkSpec[]): OverrideSet {
  const sorted = [...landmarks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  const shells = new Map<string, { lm: LandmarkSpec; shell: ShellSpec }>();
  for (const lm of sorted) {
    for (const gml of lm.replace) {
      if (shells.has(gml)) throw new Error(`overrides: ${gml} replaced twice (${lm.id})`);
      const shell = lm.shell.find((s) => s.gml === gml) ?? { gml, rules: DEFAULT_RULES };
      shells.set(gml, { lm, shell });
    }
    for (const s of lm.shell)
      if (!lm.replace.includes(s.gml)) throw new Error(`overrides ${lm.id}: shell ${s.gml} not in replace`);
  }
  return { landmarks: sorted, shells };
}

/** content/overrides/<id>/meta.json 전부(없으면 빈 집합). */
export function readOverrides(repoRoot: string): OverrideSet {
  const dir = join(repoRoot, 'content/overrides');
  if (!existsSync(dir)) return overrideSetOf([]);
  const landmarks: LandmarkSpec[] = [];
  for (const id of readdirSync(dir).sort()) {
    const file = join(dir, id, 'meta.json');
    if (!existsSync(file)) continue;
    const lm = JSON.parse(readFileSync(file, 'utf8')) as LandmarkSpec;
    if (lm.id !== id) throw new Error(`overrides: ${file} id ${lm.id} ≠ directory ${id}`);
    landmarks.push(lm);
  }
  return overrideSetOf(landmarks);
}
