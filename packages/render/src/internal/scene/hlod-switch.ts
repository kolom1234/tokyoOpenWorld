// HLOD 자식 표시 상태: 자식 셀이 live면 부모의 그 자식 영역을 0.3 s 디더로 숨기고, 자식이 해제되면 즉시 다시 보인다(구멍 없음).
// 부모가 아직 없어도 상태를 기억했다가 부모가 붙을 때 적용(도착 순서 무관). 페이드 값은 셀 메시가 공유하는 Vector4 × 4에 쓴다.
// see docs/06-world-streaming.md §5, ADR-0024
import type { CellKey } from '@sanpo/core';
import type { Vector4 } from 'three/webgpu';

export const HLOD_CHILDREN = 16;
/** 06 §5: 0.3 s 크로스페이드. */
export const HLOD_FADE_S = 0.3;

interface ParentState {
  /** 1 = 보임 목표, 0 = 숨김 목표. */
  target: Float32Array;
  fade: Float32Array;
  /** 붙어 있는 셀 메시의 페이드 벡터(없으면 상태만 보관). */
  vectors: readonly Vector4[] | undefined;
}

export interface HlodSwitch {
  setChildVisible(parent: CellKey, child: number, visible: boolean): void;
  /** 부모 셀이 렌더에 붙음/떨어짐. */
  attach(parent: CellKey, vectors: readonly Vector4[]): void;
  detach(parent: CellKey): void;
  /** 페이드 진행(renderPrep). 반환 = 진행 중인 자식 수. */
  update(dtS: number): number;
  hiddenOf(parent: CellKey): number;
  readonly size: number;
}

function write(s: ParentState): void {
  if (!s.vectors) return;
  for (let g = 0; g < 4; g++) {
    const v = s.vectors[g] as Vector4;
    v.set(
      s.fade[g * 4] as number,
      s.fade[g * 4 + 1] as number,
      s.fade[g * 4 + 2] as number,
      s.fade[g * 4 + 3] as number,
    );
  }
}

class HlodSwitchImpl implements HlodSwitch {
  private readonly parents = new Map<CellKey, ParentState>();
  private readonly animating = new Set<CellKey>();

  private stateOf(parent: CellKey): ParentState {
    let s = this.parents.get(parent);
    if (!s) {
      const ones = (): Float32Array => new Float32Array(HLOD_CHILDREN).fill(1);
      s = { target: ones(), fade: ones(), vectors: undefined };
      this.parents.set(parent, s);
    }
    return s;
  }

  private prune(parent: CellKey, s: ParentState): void {
    if (!s.vectors && s.target.every((t) => t === 1)) this.parents.delete(parent);
  }

  setChildVisible(parent: CellKey, child: number, visible: boolean): void {
    if (child < 0 || child >= HLOD_CHILDREN) throw new RangeError(`hlod child ${child}`);
    const s = this.stateOf(parent);
    s.target[child] = visible ? 1 : 0;
    // 보임 = 즉시(자식 제거 전에 부모를 보이게, 06 §5). 부모가 아직 없으면 숨김도 처음부터.
    if (visible) s.fade[child] = 1;
    else if (!s.vectors) s.fade[child] = 0;
    if (s.fade[child] !== s.target[child]) this.animating.add(parent);
    write(s);
    this.prune(parent, s);
  }

  attach(parent: CellKey, vectors: readonly Vector4[]): void {
    const s = this.stateOf(parent);
    s.vectors = vectors;
    s.fade.set(s.target);
    write(s);
  }

  detach(parent: CellKey): void {
    const s = this.parents.get(parent);
    if (!s) return;
    s.vectors = undefined;
    this.animating.delete(parent);
    this.prune(parent, s);
  }

  update(dtS: number): number {
    const stepV = dtS / HLOD_FADE_S;
    let moving = 0;
    for (const parent of this.animating) {
      const s = this.parents.get(parent);
      const left = s ? advance(s, stepV) : 0;
      if (s) write(s);
      moving += left;
      if (left === 0) this.animating.delete(parent);
    }
    return moving;
  }

  hiddenOf(parent: CellKey): number {
    const s = this.parents.get(parent);
    return s ? s.target.reduce((a, t) => a + (t === 0 ? 1 : 0), 0) : 0;
  }

  get size(): number {
    return this.parents.size;
  }
}

/** 페이드를 목표 쪽으로 step만큼. 반환 = 아직 목표에 못 간 자식 수. */
function advance(s: ParentState, step: number): number {
  let left = 0;
  for (let i = 0; i < HLOD_CHILDREN; i++) {
    const t = s.target[i] as number;
    const f = s.fade[i] as number;
    if (f === t) continue;
    s.fade[i] = t > f ? Math.min(t, f + step) : Math.max(t, f - step);
    if (s.fade[i] !== t) left++;
  }
  return left;
}

export function createHlodSwitch(): HlodSwitch {
  return new HlodSwitchImpl();
}
