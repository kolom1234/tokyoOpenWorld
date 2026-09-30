// M04-T03: world-mini 부트 → C(freecam → walk: 카메라 아래 지면에 캐릭터) → W 걷기(물리 속도 1.35 m/s, 발 = 지면) → V 3인칭 → C 복귀(바디 유지).
// 실제 입력 경로(키보드 이벤트 → input → traversal → physics 워커). SwiftShader는 프레임이 느려 이동 거리 대신 물리 속도로 판정.
// 대기는 시간 창이 아니라 상태: 키 탭 = 2프레임 처리 뒤 바로 확인, 속도 = 연속 프레임 표본, 착지·붐 = 조건 poll(game.ts).
import { expect, type Page, test } from '@playwright/test';
import { press, STATE_TIMEOUT_MS, waitSettled } from './game.ts';

type Dbg = {
  world: {
    traversal: {
      mode: string;
      view: string;
      player: { posWF: { x: number; y: number; z: number }; velWF: { x: number; y: number; z: number } };
      camera: { posWF: { x: number; y: number; z: number } };
    };
    physics: { stats(): { colliderCells: number; colliderPending: number; bodies: number } };
    ground: { groundHeightAt(x: number, z: number): number | undefined };
  };
};

test.setTimeout(240_000);

function state(page: Page) {
  return page.evaluate(() => {
    const w = (globalThis as unknown as { __SANPO_DEBUG__: Dbg }).__SANPO_DEBUG__.world;
    const p = w.traversal.player.posWF;
    const v = w.traversal.player.velWF;
    return {
      mode: w.traversal.mode,
      view: w.traversal.view,
      pos: { ...p },
      speed: Math.hypot(v.x, v.z),
      ground: w.ground.groundHeightAt(p.x, p.z),
      cam: { ...w.traversal.camera.posWF },
      stats: w.physics.stats(),
    };
  });
}

/** 다음 n프레임의 수평 속도(게임 루프 직후 표본 — 벽시계 간격이 아니라 프레임마다). */
function speedsOverFrames(page: Page, n: number): Promise<{ speed: number; mode: string; dy: number | undefined }[]> {
  return page.evaluate(async (count) => {
    const w = (globalThis as unknown as { __SANPO_DEBUG__: Dbg }).__SANPO_DEBUG__.world;
    await new Promise((r) => setTimeout(r, 0));
    const out: { speed: number; mode: string; dy: number | undefined }[] = [];
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const p = w.traversal.player.posWF;
        const v = w.traversal.player.velWF;
        const g = w.ground.groundHeightAt(p.x, p.z);
        out.push({ speed: Math.hypot(v.x, v.z), mode: w.traversal.mode, dy: g === undefined ? undefined : p.y - g });
        if (out.length >= count) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, n);
}

/** 부트 → 안정(첫 품질 티어 등) → 셀 콜라이더 4셀 적재 → C → walk·착지(발 = 지면 ±5 cm). */
async function bootAndLand(page: Page): Promise<void> {
  await page.goto('/?world=mini&debug=1&backend=webgl&time=2026-05-15T12:00:00%2B09:00');
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-cells', '4', { timeout: 60_000 });
  const colliders = async () => {
    const s = (await state(page)).stats;
    return s.colliderCells >= 4 && s.colliderPending === 0;
  };
  await expect.poll(colliders, { timeout: STATE_TIMEOUT_MS }).toBe(true);
  await waitSettled(page);
  await press(page, 'KeyC');
  expect((await state(page)).mode).toBe('walk');
  const landed = async () => {
    const s = await state(page);
    return s.stats.bodies === 1 && s.ground !== undefined && Math.abs(s.pos.y - s.ground) < 0.05;
  };
  await expect.poll(landed, { timeout: STATE_TIMEOUT_MS }).toBe(true);
}

test('walk: C lands the character on the ground, W walks at 1.35 m/s, V third person, C returns to the body', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootAndLand(page);
  const start = await state(page);
  expect(start.cam.y - start.pos.y).toBeGreaterThan(1.5);
  expect(start.cam.y - start.pos.y).toBeLessThan(1.7);

  // SwiftShader는 프레임이 느려 틱당 최대 4스텝(33 ms)만 진행 → 가속(8 m/s²)이 벽시계로 여러 초. 최고 속도까지 기다린 뒤 유지·접지를 본다.
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state(page)).speed, { timeout: STATE_TIMEOUT_MS }).toBeGreaterThan(1.3);
  const samples = await speedsOverFrames(page, 6);
  const speeds = samples.map((s) => s.speed);
  for (const s of samples) {
    expect(s.mode).toBe('walk');
    if (s.dy !== undefined) expect(Math.abs(s.dy)).toBeLessThan(0.3);
  }
  const far = async () => {
    const s = await state(page);
    return Math.hypot(s.pos.x - start.pos.x, s.pos.z - start.pos.z);
  };
  await expect.poll(far, { timeout: STATE_TIMEOUT_MS }).toBeGreaterThan(0.3);
  await page.keyboard.up('KeyW');
  const moved = await state(page);
  const info = { speeds, start: start.pos, end: moved.pos };
  test.info().annotations.push({ type: 'walk', description: JSON.stringify(info) });
  for (const v of speeds) expect(Math.abs(v - 1.35)).toBeLessThan(0.03);

  // 3인칭: 붐은 0.25 m에서 시작해 sphereCast 결과가 오면 초당 4 m로 풀린다(스폰 광장 — 뒤가 트여 있어 3.5 m 전후까지).
  await press(page, 'KeyV');
  expect((await state(page)).view).toBe('third');
  const boom = async () => {
    const tp = await state(page);
    return Math.hypot(tp.cam.x - tp.pos.x, tp.cam.y - (tp.pos.y + 1.55), tp.cam.z - tp.pos.z);
  };
  await expect.poll(boom, { timeout: STATE_TIMEOUT_MS }).toBeGreaterThan(3.0);
  expect(await boom()).toBeLessThan(3.8);

  await press(page, 'KeyC');
  expect((await state(page)).mode).toBe('freecam');
  await press(page, 'KeyC');
  expect((await state(page)).mode).toBe('walk');
  const back = await state(page);
  expect(Math.hypot(back.pos.x - moved.pos.x, back.pos.z - moved.pos.z)).toBeLessThan(0.5);
  expect(back.stats.bodies).toBe(1);
  expect(errors).toEqual([]);
});
