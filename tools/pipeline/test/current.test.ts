// M11-T06 활성 빌드 포인터: 퍼블리시된 빌드만, 이전 값 반환(롤백), 목록 읽기.
import { createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { readPointer, setCurrentBuild } from '../src/stages/publish/current.ts';

const log = createLogger({ level: 'warn' });

function memKv(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    get: async (k: string) => m.get(k),
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    m,
  };
}

describe('current build pointer', () => {
  it('switches only to published builds and returns the previous one', async () => {
    const kv = memKv({ 'BUILDS:v1': JSON.stringify([{ buildId: 'a' }, { buildId: 'b' }]), 'CURRENT_BUILD:v1': 'b' });
    expect(await readPointer(kv, 1)).toEqual({ current: 'b', builds: ['a', 'b'] });
    expect(await setCurrentBuild(kv, 1, 'a', log)).toBe('b');
    expect(kv.m.get('CURRENT_BUILD:v1')).toBe('a');
    await expect(setCurrentBuild(kv, 1, 'zzz', log)).rejects.toThrow(/not published/);
    expect(kv.m.get('CURRENT_BUILD:v1')).toBe('a');
  });
});
