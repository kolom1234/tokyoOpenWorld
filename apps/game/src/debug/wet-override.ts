// `?wet=<0..1>` → 노면 젖음 고정 + 화면 왼쪽 아래 슬라이더(M03-T06 젖음 셰이딩 수동 검증). sim 날씨(M06) 전 디버그 전용.
// 값은 환경 배선(wiring/env.ts)·태양 고정(sun-override.ts)이 render로 보내는 EnvironmentState.weather.wetness를 덮는다.
// see docs/modules/game.md
import type { EnvironmentState } from '@sanpo/core';

/** 가변 보관(슬라이더가 갱신, 배선이 매 프레임 읽음). */
export interface WeatherOverride {
  wetness: number;
}

export function parseWetFlag(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

export function withWeatherOverride(e: EnvironmentState, o: WeatherOverride | undefined): EnvironmentState {
  return o ? { ...e, weather: { ...e.weather, wetness: o.wetness } } : e;
}

/** 슬라이더 부착. 반환 = 제거 함수. */
export function mountWetSlider(doc: Document, o: WeatherOverride): () => void {
  const box = doc.createElement('label');
  box.className = 'debug-wet';
  box.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:20;font:12px system-ui;color:#fff;background:#0008;padding:6px 8px;border-radius:6px';
  const input = doc.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(o.wetness);
  const text = doc.createElement('span');
  const show = (): void => {
    text.textContent = ` wet ${o.wetness.toFixed(2)}`;
  };
  input.addEventListener('input', () => {
    o.wetness = Number(input.value);
    show();
  });
  show();
  box.append(input, text);
  doc.body.append(box);
  return () => box.remove();
}
