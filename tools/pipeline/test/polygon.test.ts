import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { writeNdjsonGz } from '../src/lib/ndjson-gz.ts';
import { clipRingsToRect, ringAreaXZ } from '../src/lib/polygon.ts';

const CELL = { minX: 0, minZ: 0, maxX: 256, maxZ: 256 };

describe('clipRingsToRect', () => {
  it('경계를 넘는 사각형: 경계 좌표는 정확히 limit, 높이는 선형 보간', () => {
    // x: 200..300, y: 0(서) → 10(동)
    const ring = [200, 0, 10, 300, 10, 10, 300, 10, 20, 200, 0, 20];
    const out = clipRingsToRect([ring], CELL);
    expect(out).not.toBeNull();
    const r = out?.[0] ?? [];
    expect(ringAreaXZ(r)).toBeCloseTo(56 * 10, 6);
    const onEdge = [];
    for (let i = 0; i < r.length; i += 3) if (r[i] === 256) onEdge.push(r[i + 1]);
    expect(onEdge).toEqual([5.6, 5.6]);
  });

  it('이웃 셀 조각의 면적 합 = 원래 면적(이음새 틈 없음)', () => {
    const ring = [200, 0, 10, 300, 0, 10, 300, 0, 20, 200, 0, 20];
    const east = { minX: 256, minZ: 0, maxX: 512, maxZ: 256 };
    const a = clipRingsToRect([ring], CELL)?.[0] ?? [];
    const b = clipRingsToRect([ring], east)?.[0] ?? [];
    expect(ringAreaXZ(a) + ringAreaXZ(b)).toBeCloseTo(ringAreaXZ(ring), 9);
  });

  it('밖에 있는 외곽은 null, 밖으로 나간 구멍은 버림', () => {
    expect(clipRingsToRect([[300, 0, 10, 400, 0, 10, 400, 0, 20]], CELL)).toBeNull();
    const outer = [100, 0, 10, 300, 0, 10, 300, 0, 20, 100, 0, 20];
    const hole = [270, 0, 12, 280, 0, 12, 280, 0, 18];
    expect(clipRingsToRect([outer, hole], CELL)?.length).toBe(1);
  });
});

describe('writeNdjsonGz', () => {
  it('gzip 헤더 mtime=0, OS=255 고정 + 내용 왕복', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sanpo-ndjson-'));
    try {
      const path = join(dir, 'a.ndjson.gz');
      expect(writeNdjsonGz(path, ['{"a":1}', '{"b":2}'])).toBe(true);
      const gz = readFileSync(path);
      expect([...gz.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
      expect(gz[9]).toBe(255);
      expect(gunzipSync(gz).toString('utf8')).toBe('{"a":1}\n{"b":2}\n');
      expect(writeNdjsonGz(join(dir, 'empty.ndjson.gz'), [])).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
