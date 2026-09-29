// 자동 노출(07 §7): 씬 패스 HDR(하늘·공중원근 전)을 32² 격자로 읽어 로그 휘도 평균 → EMA → 노출 배율. 전부 GPU(컴퓨트 1회/프레임,
// 스토리지 버퍼) — CPU 읽기 없음. 하늘 텍셀(휘도 ≈ 0 — 하늘은 aerialPerspective가 깊이 1에 그린다)은 뺀다.
// 배율 = (REF_LUM / 기하 평균)^ADAPT — 부분 적응(눈·카메라처럼 밝기 차를 다 지우지 않는다) → renderer.toneMappingExposure(수동 기준값)에 곱해진다.
import {
  exp,
  Fn,
  float,
  If,
  instancedArray,
  ivec2,
  Loop,
  log,
  luminance,
  max,
  mix,
  textureLoad,
  uniform,
} from 'three/tsl';
import type { Texture, Node as TslNode, WebGPURenderer } from 'three/webgpu';

/** 측정 격자 한 변. */
const GRID = 32;
/**
 * 기준 기하 평균 휘도(씬 패스 선형, 노출 전): 이 값이면 배율 1. 골든뷰 측정(M03-T07): 스크램블 정오 0.041(그늘진 골목), 서신주쿠 17:30 0.024(역광),
 * 요요기 상공 0.23, 주택가 0.22 — 수동 노출 3이 모두 무난했으므로 가운데 값 + 부분 적응.
 */
export const REF_LUM = 0.12;
/** 적응 지수(0 = 고정 노출, 1 = 완전 적응). 0.4 → 위 뷰들 배율 0.8–1.8. */
export const ADAPT = 0.4;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
/** 적응 시간 상수(s). */
const TAU_S = 0.8;
/** 통계용 GPU → CPU 읽기 주기(프레임). */
const READBACK_FRAMES = 30;

export interface AutoExposure {
  /** 노출 배율(프래그먼트에서 읽는 스토리지 값). */
  readonly scale: TslNode<'float'>;
  /** 렌더 뒤 호출: 이번 프레임 씬 패스를 측정해 EMA 갱신. */
  update(renderer: WebGPURenderer, dtS: number): void;
  /** 최근 읽어 온 (기하 평균 휘도, 배율) — 통계·보정용(READBACK_FRAMES마다 비동기). */
  readonly last: { lum: number; scale: number };
  dispose(): void;
}

/** 통계용 비동기 읽기(READBACK_FRAMES마다, 겹치지 않게). */
function createReadback(buffer: Parameters<WebGPURenderer['getArrayBufferAsync']>[0]) {
  let frames = 0;
  let reading = false;
  const last = { lum: 0, scale: 1 };
  const readback = (renderer: WebGPURenderer): void => {
    if (reading || ++frames % READBACK_FRAMES !== 0) return;
    reading = true;
    void renderer
      .getArrayBufferAsync(buffer)
      .then((buf) => {
        last.lum = Math.exp(new Float32Array(buf)[0] ?? 0);
        last.scale = Math.min(Math.max((REF_LUM / Math.max(last.lum, 1e-4)) ** ADAPT, MIN_SCALE), MAX_SCALE);
      })
      .catch(() => undefined)
      .finally(() => {
        reading = false;
      });
  };
  return { last, readback };
}

export function createAutoExposure(hdr: Texture): AutoExposure {
  // [0] = EMA 로그 평균 휘도(초기 = 기준), [1] = 이번 표본 수(디버그).
  const state = instancedArray(2, 'float');
  const size = uniform(ivec2(1, 1));
  const alpha = uniform(1);
  const initialized = uniform(0);
  const measure = Fn(() => {
    const sum = float(0).toVar();
    const n = float(0).toVar();
    Loop(GRID * GRID, ({ i }) => {
      const k = i as unknown as TslNode<'int'>;
      const gx = k.mod(GRID);
      const gy = k.div(GRID);
      const px = ivec2(size.x.mul(gx).add(size.x.div(2)).div(GRID), size.y.mul(gy).add(size.y.div(2)).div(GRID));
      const lum = luminance(textureLoad(hdr, px).rgb);
      If(lum.greaterThan(1e-4), () => {
        sum.addAssign(log(lum));
        n.addAssign(1);
      });
    });
    const avg = sum.div(max(n, 1));
    const prev = state.element(0);
    const a = mix(alpha, float(1), float(1).sub(initialized));
    If(n.greaterThan(0), () => {
      prev.assign(mix(prev, avg, a));
    });
    state.element(1).assign(n);
  })().compute(1);
  const scale = exp(state.element(0).negate().add(Math.log(REF_LUM)).mul(ADAPT)).clamp(MIN_SCALE, MAX_SCALE);
  let first = true;
  const { last, readback } = createReadback(state.value);
  return {
    scale,
    last,
    update(renderer, dtS) {
      const img = hdr.image as { width: number; height: number };
      size.value.set(Math.max(1, img.width), Math.max(1, img.height));
      alpha.value = 1 - Math.exp(-Math.max(dtS, 0) / TAU_S);
      initialized.value = first ? 0 : 1;
      first = false;
      renderer.compute(measure);
      readback(renderer);
    },
    dispose() {
      measure.dispose();
    },
  };
}
