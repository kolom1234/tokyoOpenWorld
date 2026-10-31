// 세이브 가져오기 자원 상한(ADR-0103, 보안 점검 후속): 파일 크기는 읽기 전에(`f.text()` 전), 배열 길이·썸네일 합계는 JSON 파싱 직후 마이그레이션 전에.
// 정상 세이브의 몇 배 여유 — 사진 상한 200장(game MAX_PHOTOS), 썸네일 = 360 px JPEG q0.82(≈ 20–60 KB → data URL ×1.34). see docs/12-ui-ux.md §4
import type { SaveImportProblem } from '../../api.ts';

export const SAVE_LIMITS = {
  /** 파일 크기(바이트). 썸네일 200장 × 최대 수백 KB + 본문. */
  fileBytes: 24 * 1024 * 1024,
  /** 사진 메타·썸네일 개수(= game shell/photo.ts MAX_PHOTOS). */
  photos: 200,
  /** 발견 기록·빠른 이동 열림 목록(명소 수의 몇 배). */
  discoveries: 2000,
  unlocked: 2000,
  /** 발견 하나에 붙은 사진 id. */
  photoIdsPerDiscovery: 200,
  /** 썸네일 data URL 하나·전체 글자 수. */
  thumbChars: 1_000_000,
  thumbTotalChars: 20_000_000,
} as const;

/** 가져오기 실패 사유를 담은 오류 — UI가 사유별 안내를 고른다(`problem`). */
export class SaveImportError extends Error {
  readonly problem: SaveImportProblem;
  constructor(problem: SaveImportProblem) {
    super(`save import: ${problem}`);
    this.name = 'SaveImportError';
    this.problem = problem;
  }
}

const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** 파싱한 내보내기 원문(마이그레이션 전)이 상한 안인가. v1 필드(`discovered`)도 센다. */
export function withinSaveLimits(raw: Record<string, unknown>): boolean {
  const save = (typeof raw.save === 'object' && raw.save !== null ? raw.save : {}) as Record<string, unknown>;
  const discoveries = Array.isArray(save.discoveries) ? save.discoveries : [];
  if (len(save.photos) > SAVE_LIMITS.photos) return false;
  if (discoveries.length > SAVE_LIMITS.discoveries || len(save.discovered) > SAVE_LIMITS.discoveries) return false;
  if (len(save.unlocked) > SAVE_LIMITS.unlocked) return false;
  for (const d of discoveries) {
    const ids = typeof d === 'object' && d !== null ? (d as Record<string, unknown>).photoIds : undefined;
    if (len(ids) > SAVE_LIMITS.photoIdsPerDiscovery) return false;
  }
  const thumbs = typeof raw.thumbs === 'object' && raw.thumbs !== null ? Object.values(raw.thumbs) : [];
  if (thumbs.length > SAVE_LIMITS.photos) return false;
  let total = 0;
  for (const t of thumbs) {
    const n = typeof t === 'string' ? t.length : 0;
    if (n > SAVE_LIMITS.thumbChars) return false;
    total += n;
  }
  return total <= SAVE_LIMITS.thumbTotalChars;
}
