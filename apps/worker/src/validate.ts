// 요청 입력 검증: buildId 형식, /world 경로(경로 조작 차단), formatVersion 쿼리. see docs/13-deployment.md §4
/** `YYYYMMDD-<git sha7>-<content hash8>` */
export const BUILD_ID_RE = /^[0-9]{8}-[0-9a-f]{7}-[0-9a-f]{8}$/;
/** buildId 뒤 경로 세그먼트 허용 문자. `%`(인코딩 우회)·`\`·공백 등은 전부 거부. */
const SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;
/** R2 키 길이 상한(여유분 포함, R2 한도 1024 bytes). */
const MAX_REL_PATH_LENGTH = 512;
/** formatVersion 쿼리: 1–999 정수. */
const FORMAT_VERSION_RE = /^[1-9][0-9]{0,2}$/;

export function isValidBuildId(s: string): boolean {
  return BUILD_ID_RE.test(s);
}

/** `/world/<buildId>/<rel>` → `{ buildId, key: "world/<buildId>/<rel>" }`. 형식 위반·`.`/`..` 세그먼트는 undefined. */
export function parseWorldPath(pathname: string): { buildId: string; key: string } | undefined {
  const m = /^\/world\/([^/]+)\/(.+)$/.exec(pathname);
  if (m === null) return undefined;
  const [, buildId = '', rel = ''] = m;
  if (!isValidBuildId(buildId) || rel.length > MAX_REL_PATH_LENGTH) return undefined;
  const ok = rel.split('/').every((seg) => SEGMENT_RE.test(seg) && seg !== '.' && seg !== '..');
  return ok ? { buildId, key: `world/${buildId}/${rel}` } : undefined;
}

export function parseFormatVersion(raw: string | null): number | undefined {
  return raw !== null && FORMAT_VERSION_RE.test(raw) ? Number(raw) : undefined;
}
