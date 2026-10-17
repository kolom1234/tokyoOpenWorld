// 선컴파일 대상 맞추기(ADR-0086): 후처리 경로에서 머티리얼은 씬 패스(렌더 타깃 + MRT, 속도 = TAAU의 지터 없는 투영)로만 그려진다.
// `renderer.compileAsync`를 캔버스 대상으로 부르면 출력 형식·MRT 출력·속도 투영이 다른 변형을 만들고, 진짜 변형은 첫 프레임 render에서 **동기**로
// 다시 만든다(실측: 셀 75묶음·조명 셰이더가 두 번 — 첫 프레임 ≈ 0.6–1 s, 첫 표시 ≈ 1–2 s 손해).
// three r186 compileAsync는 노드 빌드를 호출 뒤 객체마다 비동기로 한다(사이에 프레임 양보) — 노드 빌드는 전역 상태(renderer.getMRT()·velocity 투영)를
// 그때 읽는다. 그래서 컴파일이 하나라도 진행 중인 동안 씬 패스 상태를 걸어 두고(참조 수), 그 사이 프레임 렌더(`frame`)만 잠깐 풀었다가 다시 건다.
import { velocity } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import type { CompileTarget } from '../post/pipeline.ts';

export interface CompileScope {
  /** 프레임 렌더(후처리·직접)를 감싼다 — 컴파일 중이면 전역 상태를 풀고 렌더 뒤 다시 건다. */
  frame(render: () => void): void;
  /** 진행 중 컴파일 수(테스트·통계). */
  readonly active: number;
}

/** 렌더러의 compileAsync를 씬 패스 대상으로 감싼다. target() = 지금 후처리의 대상(직접 렌더 = null → 그대로). */
export function routeCompileToScenePass(renderer: WebGPURenderer, target: () => CompileTarget | null): CompileScope {
  const compile = renderer.compileAsync.bind(renderer);
  let depth = 0;
  let current: CompileTarget | null = null;
  const apply = (t: CompileTarget): void => {
    renderer.setRenderTarget(t.target);
    renderer.setMRT(t.mrt);
    velocity.setProjectionMatrix(t.velocityProjection);
  };
  const clear = (): void => {
    velocity.setProjectionMatrix(null);
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
  };
  renderer.compileAsync = async (scene, camera, targetScene, onProgress) => {
    const t = current ?? target();
    if (t === null) return compile(scene, camera, targetScene, onProgress);
    if (depth++ === 0) {
      current = t;
      apply(t);
    }
    try {
      await compile(scene, camera, targetScene, onProgress);
    } finally {
      if (--depth === 0) {
        current = null;
        clear();
      }
    }
  };
  return {
    frame(render) {
      if (current === null) return render();
      const t = current;
      clear();
      try {
        render();
      } finally {
        apply(t);
      }
    },
    get active() {
      return depth;
    },
  };
}
