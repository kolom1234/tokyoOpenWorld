// 거리별 연속 표시(M07 사전 ⓪): 같은 소품을 앞에서 내려다보며 100 → 16 m로 다가가 LOD 띠(150·40 m)를 넘을 때마다
// 소품 레이어 보임/숨김 캔버스 차(Node PNG 디코드)를 화면 중앙 창에서 센다 — 매 거리 그려져야 한다.
// 회귀: 신호 램프 갱신이 같은 프레임의 풀 재작성 `_itype` 업로드 범위를 지워, 신호가 섞인 풀의 다른 소품이 가까이 가면 사라졌다(직육면체 소멸).
// 대상 = world-mini 자판기(정면 = 길 쪽 yaw — 자기 건물에 가리지 않게). 상태 기반 대기(안정 플래그·프레임 수). see docs/14-testing-perf.md §1
import { expect, type Page, test } from '@playwright/test';
import { captureCanvas, waitFrames, waitSettled } from './game.ts';
import { decodePng, type RgbaImage } from './png.ts';

const QUERY =
  '/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00&mode=freecam&dynres=0&shadows=0&trees=0&crowd=0&traffic=0';
/** 내려다보는 각(rad) — 높을수록 주변 건물에 덜 가린다. */
const PITCH = 0.9;
/** 카메라–대상 거리(m): LOD1(40–150 m) → LOD0(40 m 안) — 띠가 바뀔 때 풀을 다시 채운다. */
const DISTANCES = [100, 60, 34, 16];
/**
 * 거리별 최소 변화 픽셀(480×270) ≈ 수정 뒤 SwiftShader 실측(대상 0: 9·29·77·321, 1: 8·22·56·240)의 40 %.
 * 회귀(범위 덮어쓰기) 재현 값: 1·5·17·32 / 0·2·34·135 → 실패.
 */
const MIN_PIXELS: Readonly<Record<number, number>> = { 100: 4, 60: 10, 34: 25, 16: 110 };
/** world-mini 자판기 [x, y(바닥), z, yaw(정면)] — 실제 GPU 스캔에서 네 거리 모두 앞이 트인 것(주변 풀에 신호기). */
const TARGETS: readonly (readonly [number, number, number, number])[] = [
  [-14.49, 17.49, -153.73, 2.371],
  [-8.75, 17.15, -218.53, 1.568],
];
const DIFF_THRESHOLD = 45;

test.use({ viewport: { width: 480, height: 270 } });
// SwiftShader 병렬 러너는 프레임이 수 초까지 늘어난다 — 판정은 상태(안정 플래그·프레임 수)로, 이 값은 교착 상한.
test.setTimeout(420_000);

type Debug = {
  __SANPO_DEBUG__: {
    world: {
      traversal: { request(mode: 'freecam', o: { posWF: object; yawRad: number; pitchRad: number }): void };
      render: { debugLayerVisible(layer: 'props', visible: boolean): void };
    };
  };
};

/** 중앙 정사각 창(반지름 r px)에서 RGB 합 차가 임계를 넘는 픽셀 수. */
function changedPixels(a: RgbaImage, b: RgbaImage, r: number): number {
  const cx = Math.floor(a.width / 2);
  const cy = Math.floor(a.height / 2);
  let n = 0;
  for (let y = Math.max(0, cy - r); y < Math.min(a.height, cy + r); y++)
    for (let x = Math.max(0, cx - r); x < Math.min(a.width, cx + r); x++) {
      const i = (y * a.width + x) * 4;
      const d =
        Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
        Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
        Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0));
      if (d > DIFF_THRESHOLD) n++;
    }
  return n;
}

async function look(page: Page, t: readonly [number, number, number, number], d: number): Promise<void> {
  const [x, y, z, yaw] = t;
  const h = d * Math.cos(PITCH);
  const pose = { x: x + Math.sin(yaw) * h, y: y + 1 + d * Math.sin(PITCH), z: z + Math.cos(yaw) * h };
  await page.evaluate(
    ([p, yawRad, pitchRad]) =>
      (globalThis as unknown as Debug).__SANPO_DEBUG__.world.traversal.request('freecam', {
        posWF: p as object,
        yawRad: yawRad as number,
        pitchRad: pitchRad as number,
      }),
    [pose, yaw, -PITCH] as const,
  );
}

const setProps = (page: Page, visible: boolean): Promise<void> =>
  page.evaluate(
    (v) => (globalThis as unknown as Debug).__SANPO_DEBUG__.world.render.debugLayerVisible('props', v),
    visible,
  );

test('the same prop stays drawn from 100 m down to 16 m across LOD bands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(QUERY);
  await waitSettled(page);
  const rows: { target: number; d: number; px: number }[] = [];
  for (const [ti, t] of TARGETS.entries()) {
    for (const d of DISTANCES) {
      await look(page, t, d);
      // 요청은 다음 프레임에 반영 → 그 뒤 스트리밍·LOD 재작성이 끝난 안정 상태.
      await waitFrames(page, 3);
      await waitSettled(page, 3);
      const shown = decodePng(await captureCanvas(page));
      await setProps(page, false);
      await waitFrames(page, 2);
      const hidden = decodePng(await captureCanvas(page));
      await setProps(page, true);
      await waitFrames(page, 2);
      // 창 반지름 ∝ 1/거리(자판기 ≈ 1.1 × 1.9 m), 최소 8 px.
      rows.push({ target: ti, d, px: changedPixels(shown, hidden, Math.max(8, Math.round(700 / d))) });
    }
  }
  test.info().annotations.push({ type: 'lod-continuity', description: JSON.stringify(rows) });
  for (const r of rows)
    expect(r.px, `target ${r.target} at ${r.d} m — ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(
      MIN_PIXELS[r.d] ?? 0,
    );
  expect(errors).toEqual([]);
});
