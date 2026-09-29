// 백엔드 예측(M03-T09): 소프트웨어 래스터(SwiftShader·llvmpipe) 판정 — 후처리·그림자·프로브를 끄는 기준.
import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer } from '../src/internal/renderer/backend-caps.ts';

describe('isSoftwareRenderer', () => {
  it('flags software rasterizers and keeps real GPUs', () => {
    expect(
      isSoftwareRenderer(
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      ),
    ).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)')).toBe(true);
    expect(
      isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'),
    ).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
  });
});
