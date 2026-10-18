// 메뉴 컨트롤: 버튼·선택(◀ ▶)·슬라이더·켬/끔. 모두 data-nav(공간 내비게이션) + 조절형은 data-nav-adjust(←→ = navadjust 이벤트).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n/t.ts';

/** navadjust(←→·패드) 이벤트 → onAdjust(±1). */
function useAdjust(onAdjust: (d: -1 | 1) => void) {
  const ref = useRef<HTMLButtonElement>(null);
  const fn = useRef(onAdjust);
  fn.current = onAdjust;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: Event) => fn.current((e as CustomEvent<number>).detail > 0 ? 1 : -1);
    el.addEventListener('navadjust', h);
    return () => el.removeEventListener('navadjust', h);
  }, []);
  return ref;
}

export function MenuButton(p: {
  label: string;
  onClick: () => void;
  autofocus?: boolean;
  disabled?: boolean;
  id?: string;
  variant?: 'primary' | 'plain';
}) {
  return (
    <button
      type="button"
      class={`btn ${p.variant === 'plain' ? 'btn-plain' : ''}`}
      data-nav
      data-autofocus={p.autofocus ? '' : undefined}
      disabled={p.disabled}
      id={p.id}
      onClick={p.onClick}
    >
      {p.label}
    </button>
  );
}

export function Row(p: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="row">
      <div class="row-label">
        <span>{p.label}</span>
        {p.hint ? <small>{p.hint}</small> : null}
      </div>
      <div class="row-control">{p.children}</div>
    </div>
  );
}

export function Choice<T extends string>(p: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  id?: string;
  autofocus?: boolean;
}) {
  const i = Math.max(
    0,
    p.options.findIndex((o) => o.value === p.value),
  );
  const step = (d: -1 | 1) => {
    const n = p.options.length;
    const next = p.options[(i + d + n) % n];
    if (next) p.onChange(next.value);
  };
  const ref = useAdjust(step);
  return (
    <button
      ref={ref}
      type="button"
      class="choice"
      data-nav
      data-nav-adjust
      data-autofocus={p.autofocus ? '' : undefined}
      id={p.id}
      data-value={p.value}
      onClick={() => step(1)}
    >
      <span class="arrow">◀</span>
      <span class="choice-label">{p.options[i]?.label ?? ''}</span>
      <span class="arrow">▶</span>
    </button>
  );
}

export function Toggle(p: { value: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <Choice
      value={p.value ? 'on' : 'off'}
      options={[
        { value: 'off', label: t('common.off') },
        { value: 'on', label: t('common.on') },
      ]}
      onChange={(v) => p.onChange(v === 'on')}
      {...(p.id ? { id: p.id } : {})}
    />
  );
}

export function Slider(p: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  id?: string;
}) {
  const clamp = (v: number) => Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
  const ref = useAdjust((d) => p.onChange(clamp(p.value + d * p.step)));
  const frac = (p.value - p.min) / (p.max - p.min);
  const fromPointer = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    p.onChange(clamp(p.min + ((e.clientX - r.left) / r.width) * (p.max - p.min)));
  };
  return (
    <button
      ref={ref}
      type="button"
      class="slider"
      role="slider"
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={p.value}
      data-nav
      data-nav-adjust
      id={p.id}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) fromPointer(e);
      }}
    >
      <span class="slider-track">
        <span class="slider-fill" style={{ width: `${(frac * 100).toFixed(1)}%` }} />
      </span>
      <span class="slider-value">{p.format(p.value)}</span>
    </button>
  );
}

export function NavHint(p: { pad: boolean }) {
  return <div class="nav-hint">{t(p.pad ? 'nav.hint.pad' : 'nav.hint.keys')}</div>;
}
