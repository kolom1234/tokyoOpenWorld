// 파사드 파라미터(M03-T04): 용도 → 클래스, 높이 보정, 1층 상점·커튼월 플래그, 결정론.
import { describe, expect, it } from 'vitest';
import { FACADE_CLASS, FACADE_FLAG, facadeParams } from '../src/stages/build/facade-params.ts';

const p = (usage: string | null, heightM: number, id = 'b') => facadeParams({ id, usage, heightM, floors: 5 });

describe('facadeParams', () => {
  it('maps PLATEAU usage codes to facade classes', () => {
    expect(p('401', 30)[0]).toBe(FACADE_CLASS.office);
    expect(p('412', 30)[0]).toBe(FACADE_CLASS.mansion);
    expect(p('411', 8)[0]).toBe(FACADE_CLASS.house);
    expect(p('402', 12)[0]).toBe(FACADE_CLASS.commercial);
    expect(p('422', 12)[0]).toBe(FACADE_CLASS.public);
    expect(p('441', 12)[0]).toBe(FACADE_CLASS.industrial);
  });

  it('corrects tall houses and guesses unknown usage from height', () => {
    expect(p('411', 20)[0]).toBe(FACADE_CLASS.mansion);
    expect(p(null, 45)[0]).toBe(FACADE_CLASS.office);
    expect(p('461', 12)[0]).toBe(FACADE_CLASS.mansion);
    expect(p(null, 7)[0]).toBe(FACADE_CLASS.house);
  });

  it('flags ground-floor retail and curtain-wall towers', () => {
    expect(p('402', 10)[3] & FACADE_FLAG.retail).toBe(FACADE_FLAG.retail);
    expect(p('413', 9)[3] & FACADE_FLAG.retail).toBe(FACADE_FLAG.retail);
    expect(p('411', 8)[3] & FACADE_FLAG.retail).toBe(0);
    expect(p('401', 200)[3] & FACADE_FLAG.curtainWall).toBe(FACADE_FLAG.curtainWall);
    expect(p('412', 200)[3] & FACADE_FLAG.curtainWall).toBe(0);
  });

  it('is deterministic per id and varies tint across ids', () => {
    expect(p('401', 30, 'x')).toEqual(p('401', 30, 'x'));
    const tints = new Set(Array.from({ length: 64 }, (_, i) => p('401', 30, `id-${i}`)[2]));
    expect(tints.size).toBeGreaterThan(40);
    expect(facadeParams({ id: 'a', usage: null, heightM: 3, floors: 0 })[1]).toBe(1);
  });
});
