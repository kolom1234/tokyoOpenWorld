#!/usr/bin/env bash
# 배포 스모크 테스트: /api/health 200 + ok:true + COOP 헤더(Worker 응답), / 200 + COOP/COEP(정적 에셋, public/_headers).
# 전파 지연을 고려해 재시도.
# 사용: .github/scripts/smoke.sh https://tokyo-sanpo-staging.<subdomain>.workers.dev
set -euo pipefail
base="${1:?base url required}"
attempts=6

has_header() { tr -d '\r' < "$1" | grep -qi "^$2\$"; }

check() {
  local api_headers page_headers
  api_headers=$(mktemp)
  page_headers=$(mktemp)
  curl -fsS --max-time 10 -D "$api_headers" "$base/api/health" | grep -q '"ok":true' &&
    has_header "$api_headers" 'cross-origin-opener-policy: same-origin' &&
    curl -fsS --max-time 10 -D "$page_headers" -o /dev/null "$base/" &&
    has_header "$page_headers" 'cross-origin-opener-policy: same-origin' &&
    has_header "$page_headers" 'cross-origin-embedder-policy: require-corp'
}

for i in $(seq 1 "$attempts"); do
  if check; then
    echo "smoke: ok ($base)"
    exit 0
  fi
  echo "smoke: attempt $i/$attempts failed, retrying in $((i * 5))s"
  sleep $((i * 5))
done
echo "::error::smoke test failed for $base (/api/health body/headers or / status/isolation headers)"
exit 1
