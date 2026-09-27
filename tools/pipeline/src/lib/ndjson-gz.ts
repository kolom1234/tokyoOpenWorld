// 결정론적 ndjson.gz 입출력: 키 정렬된 레코드 → gzip(헤더 mtime=0, OS=255 고정). see docs/04-data-pipeline.md §1(재현성)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** gzip 헤더 OS 바이트 오프셋(RFC 1952). zlib은 빌드 플랫폼 값을 쓰므로 255(unknown)로 고정해 OS 간 바이트 동일. */
const GZIP_OS_OFFSET = 9;
const GZIP_OS_UNKNOWN = 255;
const GZIP_LEVEL = 9;

/** 이미 정렬된 JSON 줄들을 gzip으로 기록. 빈 목록이면 빈 파일 대신 기록하지 않는다(false 반환). */
export function writeNdjsonGz(path: string, lines: readonly string[]): boolean {
  if (lines.length === 0) return false;
  const gz = gzipSync(Buffer.from(`${lines.join('\n')}\n`, 'utf8'), { level: GZIP_LEVEL });
  gz[GZIP_OS_OFFSET] = GZIP_OS_UNKNOWN;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gz);
  return true;
}

export function readNdjsonGz<T>(path: string): T[] {
  return gunzipSync(readFileSync(path))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}
