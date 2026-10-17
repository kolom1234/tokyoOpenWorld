// 선컴파일 대상(ADR-0086): compileAsync가 진행 중인 동안(비동기 노드 빌드 포함) 씬 패스 타깃·MRT·속도 투영이 걸려 있고,
// 그 사이 프레임 렌더는 풀린 상태로 그린 뒤 다시 건다. 겹친 컴파일은 마지막이 끝나야 푼다.
import { velocity } from 'three/tsl';
import { Matrix4, type MRTNode, RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { routeCompileToScenePass } from '../src/internal/renderer/compile-scope.ts';

interface Seen {
  target: RenderTarget | null;
  mrt: MRTNode | null;
  proj: Matrix4 | null;
}

function fakeRenderer() {
  let target: RenderTarget | null = null;
  let mrt: MRTNode | null = null;
  const seen: Seen[] = [];
  const gates: Array<() => void> = [];
  const r = {
    getRenderTarget: () => target,
    setRenderTarget: (t: RenderTarget | null) => {
      target = t;
    },
    getMRT: () => mrt,
    setMRT: (m: MRTNode | null) => {
      mrt = m;
    },
    /** 진짜처럼: 호출 뒤 비동기로 상태를 읽는다(노드 빌드). gates를 열면 끝난다. */
    compileAsync: async () => {
      await new Promise<void>((res) => gates.push(res));
      seen.push({ target, mrt, proj: (velocity as unknown as { projectionMatrix: Matrix4 | null }).projectionMatrix });
    },
  };
  return { renderer: r as unknown as WebGPURenderer, seen, gates, state: () => ({ target, mrt }) };
}

const proj = (): Matrix4 | null => (velocity as unknown as { projectionMatrix: Matrix4 | null }).projectionMatrix;

describe('routeCompileToScenePass', () => {
  it('keeps the scene-pass state for the whole async compile, frames render with it cleared', async () => {
    const f = fakeRenderer();
    const target = new RenderTarget(4, 4);
    const mrt = { id: 1 } as unknown as MRTNode;
    const m = new Matrix4();
    const scope = routeCompileToScenePass(f.renderer, () => ({ target, mrt, velocityProjection: m }));
    const a = f.renderer.compileAsync({} as never, {} as never);
    const b = f.renderer.compileAsync({} as never, {} as never);
    expect(scope.active).toBe(2);
    expect(f.state()).toEqual({ target, mrt });
    let during: unknown;
    scope.frame(() => {
      during = { ...f.state(), proj: proj() };
    });
    expect(during).toEqual({ target: null, mrt: null, proj: null });
    expect(f.state()).toEqual({ target, mrt });
    expect(proj()).toBe(m);
    f.gates.shift()?.();
    await a;
    expect(scope.active).toBe(1);
    expect(f.state().target).toBe(target);
    f.gates.shift()?.();
    await b;
    expect(f.seen).toEqual([
      { target, mrt, proj: m },
      { target, mrt, proj: m },
    ]);
    expect(scope.active).toBe(0);
    expect(f.state()).toEqual({ target: null, mrt: null });
    expect(proj()).toBeNull();
  });

  it('direct render (no scene pass) compiles as is', async () => {
    const f = fakeRenderer();
    const scope = routeCompileToScenePass(f.renderer, () => null);
    const p = f.renderer.compileAsync({} as never, {} as never);
    expect(scope.active).toBe(0);
    f.gates.shift()?.();
    await p;
    expect(f.seen).toEqual([{ target: null, mrt: null, proj: null }]);
  });
});
