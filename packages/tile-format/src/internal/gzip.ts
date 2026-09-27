// gzip/gunzip — Compression/DecompressionStream(브라우저·워커·Node 22+ 공통). see docs/05-tile-format.md §4 (gzip 코덱)
import type { Result } from '@sanpo/core';
import { type TkcError, TkcErrorCode } from '../api.ts';
import { fail } from './bytes.ts';

// RFC 1952 헤더의 OS 바이트 위치와 "unknown" 값. zlib 빌드(Windows=10, Unix=3)에 따른 차이를 없애 결정론 확보.
const GZIP_OS_OFFSET = 9;
const GZIP_OS_UNKNOWN = 0xff;

async function pump(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // 쓰기 쪽 거부는 읽기 쪽에서 같은 오류로 드러나므로 여기선 삼킨다(미처리 거부 방지).
  writer
    .write(bytes as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => undefined);
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * gzip 압축(기본 레벨). mtime=0이고 OS 바이트를 0xFF로 고정 — 같은 런타임(zlib 버전)에서 같은 입력 → 같은 바이트.
 * 파이프라인 재현성은 컨테이너 Node 버전 고정에 의존한다(ADR-0017).
 */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await pump(bytes, new CompressionStream('gzip'));
  if (out.byteLength > GZIP_OS_OFFSET) out[GZIP_OS_OFFSET] = GZIP_OS_UNKNOWN;
  return out;
}

/** gzip 해제. 손상·잘린 입력은 `corrupt`. */
export async function gunzip(bytes: Uint8Array): Promise<Result<Uint8Array, TkcError>> {
  try {
    return { ok: true, value: await pump(bytes, new DecompressionStream('gzip')) };
  } catch (e) {
    return fail(TkcErrorCode.Corrupt, `gunzip: ${(e as Error).message}`);
  }
}
