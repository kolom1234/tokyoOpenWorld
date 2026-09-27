// 섹션 레지스트리 조회·섹션 해시·16바이트 정렬 유틸. see docs/05-tile-format.md §3–4
import { SECTION_REGISTRY, type SectionSpec, type SectionType, TKC_ALIGN } from '../api.ts';
import { xxh64Hex } from './xxh64.ts';

const HASH_PREFIX = 'xxh64:';
export const HASH_RE = /^xxh64:[0-9a-f]{16}$/;

/** 레지스트리 등록 타입인가(미지 섹션 판정). */
export function isSectionType(type: string): type is SectionType {
  return Object.hasOwn(SECTION_REGISTRY, type);
}

export function sectionSpec(type: SectionType): SectionSpec {
  return SECTION_REGISTRY[type];
}

/** 헤더 `hash` 값: `"xxh64:" + XXH64(seed 0) hex`. */
export function sectionHash(data: Uint8Array): string {
  return HASH_PREFIX + xxh64Hex(data);
}

/** n 이상인 최소 16의 배수. */
export function align16(n: number): number {
  return Math.ceil(n / TKC_ALIGN) * TKC_ALIGN;
}
