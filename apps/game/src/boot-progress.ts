// 부팅 로딩 패널 "준비" 행(M06): 선컴파일 단계(대기 LUT → 셰이더 n/N → 아바타) · 스폰 셀 live 수 · 경과 s.
// 선컴파일은 묶음마다 한 프레임 양보한다(render precompile) — 경과 숫자가 멈추면 그 순간 프레임이 안 나오는 것(GPU 파이프라인 생성).
import type { CellKey, GameSystem } from '@sanpo/core';
import type { PrecompileProgress } from '@sanpo/render';
import type { StreamingService } from '@sanpo/streaming';
import type { StatusView } from './status-view.ts';

/** world-view가 갱신하는 부팅 단계. done = 첫 표시(셀 붙임) 끝. */
export interface BootStage {
  precompile: string;
  spawn?: readonly CellKey[];
  done: boolean;
}

const STAGE_TEXT: Readonly<Record<PrecompileProgress['stage'], string>> = {
  atmosphere: '대기 LUT',
  materials: '셰이더',
  avatar: '아바타 셰이더',
};

export function precompileText(p: PrecompileProgress): string {
  if (p.stage === 'materials') return `셰이더 ${p.done}/${p.total}`;
  return `${STAGE_TEXT[p.stage]}${p.done >= p.total ? ' ✓' : '…'}`;
}

export function bootProgressText(b: BootStage, s: Pick<StreamingService, 'stateOf'> | undefined): string {
  if (b.done) return '';
  const spawn = b.spawn;
  const cells = spawn && s ? ` · 셀 ${spawn.filter((k) => s.stateOf(k) === 'live').length}/${spawn.length}` : '';
  return `${b.precompile}${cells}`;
}

/** 프레임마다 준비 글 + 경과(0.1 s) → 상태 패널(바뀔 때만 DOM). phase 95 = 렌더 뒤(DOM만). */
export function bootProgressSystem(
  view: Pick<StatusView, 'setProgress'>,
  world: { bootProgress(): string },
): GameSystem {
  let last = '';
  return {
    id: 'game/boot-progress',
    phase: 95,
    update() {
      const p = world.bootProgress();
      const text = p ? `${p} · ${(performance.now() / 1000).toFixed(1)} s` : '';
      if (text === last) return;
      last = text;
      view.setProgress(text);
    },
    dispose() {},
  };
}
