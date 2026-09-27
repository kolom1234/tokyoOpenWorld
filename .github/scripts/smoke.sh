#!/usr/bin/env bash
# 배포 스모크 테스트: /api/health 200 + ok:true + COOP 헤더(Worker 응답), / 200(정적 에셋). 전파 지연을 고려해 재시도.
# (정적 에셋은 Worker를 거치지 않으므로 헤더는 _headers 파일 담당 — M00-T04 이후 / 헤더 검사 추가)
# 사용: .github/scripts/smoke.sh https://tokyo-sanpo-staging.<subdomain>.workers.dev
set -euo pipefail
base="${1:?base url required}"
attempts=6

check() {
  local headers
  headers=$(mktemp)
  curl -fsS --max-time 10 -D "$headers" "$base/api/health" | grep -q '"ok":true' &&
    tr -d '\r' < "$headers" | grep -qi '^cross-origin-opener-policy: same-origin$' &&
    curl -fsS --max-time 10 -o /dev/null "$base/"
}

for i in $(seq 1 "$attempts"); do
  if check; then
    echo "smoke: ok ($base)"
    exit 0
  fi
  echo "smoke: attempt $i/$attempts failed, retrying in $((i * 5))s"
  sleep $((i * 5))
done
echo "::error::smoke test failed for $base (/api/health body/headers or / status)"
exit 1
