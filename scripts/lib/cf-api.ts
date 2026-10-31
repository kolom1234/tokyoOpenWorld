// Cloudflare 읽기 전용 API 도우미(M11-T03 오류 조회·M11-T06 사용량 점검): 토큰 = 환경 변수 CLOUDFLARE_API_TOKEN(권한 Account Analytics: Read),
// 계정 = CLOUDFLARE_ACCOUNT_ID 또는 토큰이 보는 첫 계정. 값은 출력·기록하지 않는다.
const API = 'https://api.cloudflare.com/client/v4';

export function token(): string {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  return t;
}

export async function accountId(): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const r = (await (await fetch(`${API}/accounts`, { headers: { Authorization: `Bearer ${token()}` } })).json()) as {
    result?: { id: string }[];
  };
  const id = r.result?.[0]?.id;
  if (!id) throw new Error('no Cloudflare account visible to the token');
  return id;
}

/** REST GET → `result`(실패 = 예외 — 권한 없음 포함). */
export async function rest<T>(path: string): Promise<{ result: T; result_info?: { total_pages?: number } }> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  const j = (await res.json()) as { success: boolean; result: T; result_info?: { total_pages?: number } };
  if (!res.ok || !j.success) throw new Error(`GET ${path.split('?')[0]?.replace(/[0-9a-f]{32}/g, '…')} ${res.status}`);
  return j;
}

/** Workers Analytics Engine SQL API → 행 목록. */
export async function aeSql<T = Record<string, unknown>>(acc: string, sql: string): Promise<T[]> {
  const res = await fetch(`${API}/accounts/${acc}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: sql,
  });
  if (!res.ok) throw new Error(`analytics_engine/sql ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { data: T[] }).data;
}

/** GraphQL Analytics API. */
export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await res.json()) as { data: T; errors: { message: string }[] | null };
  if (j.errors?.length) throw new Error(`graphql: ${j.errors.map((e) => e.message).join('; ')}`);
  return j.data;
}
