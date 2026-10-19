// 후처리 출력 단(07 §7): 출력 변환(AgX·sRGB, renderOutput) → 3D LUT → Sharpen, 포토 DOF 출력 교체(M10 잔여 — pipeline.ts에서 분리).
import { lut3D } from 'three/examples/jsm/tsl/display/Lut3DNode.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { renderOutput, texture3D, uniform, vec4 } from 'three/tsl';
import type { RenderPipeline, Node as TslNode } from 'three/webgpu';
import type { PostEffects } from '../../api.ts';
import { colorVisionU } from './color-vision.ts';
import { createGradeLut, LUT_SIZE } from './lut.ts';

type V4 = TslNode<'vec4'>;

/**
 * 출력 단(톤매핑·LUT·샤픈) + 포토 DOF 교체(M10 잔여): 기본 출력과 DOF 출력(처음 켤 때 만듦)이 같은 HDR·TAAU를 공유 —
 * 바꿀 때 출력 사각형·DOF 내부 패스만 컴파일(전체 재구성 = 씬 머티리얼 재컴파일 4.8 s 없음).
 */
export function outputSwitch(
  pipeline: RenderPipeline,
  hdr: V4,
  fx: PostEffects,
  makeDof: () => unknown,
  nodes: { dispose(): void }[],
): { lut: ReturnType<typeof createGradeLut> | undefined; setDof(on: boolean): void } {
  const lut = fx.lut ? createGradeLut() : undefined;
  const finish = (h: V4): V4 => {
    // 색각 보정(M11-T04): 선형 HDR에 행렬(끔 = 단위 행렬).
    let out: V4 = renderOutput(vec4(colorVisionU.mul(h.rgb), h.a) as unknown as V4);
    if (lut) out = lut3D(out, texture3D(lut), LUT_SIZE, uniform(1)) as unknown as V4;
    if (fx.sharpen) out = sharpen(out, 0.15) as unknown as V4;
    return out;
  };
  const base = finish(hdr);
  let dofOut: V4 | undefined;
  let on = false;
  pipeline.outputNode = base;
  return {
    lut,
    setDof(want) {
      if (want === on) return;
      on = want;
      if (on && !dofOut) {
        const d = makeDof();
        nodes.push(d as { dispose(): void });
        dofOut = finish(d as V4);
      }
      pipeline.outputNode = on && dofOut ? dofOut : base;
      pipeline.needsUpdate = true;
    },
  };
}
