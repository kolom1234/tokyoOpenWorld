#!/usr/bin/env sh
# 셀 빌드 재현성 검사: 같은 컨테이너에서 build 2회 → 모든 산출 파일 sha256 비교 → validate. see docs/04-data-pipeline.md §1, §4.6
# gzip 바이트는 Node(zlib) 버전에 의존하므로 반드시 파이프라인 컨테이너 안에서 실행한다(ADR-0017).
# 사용: tools/pipeline/docker/run.sh sh tools/pipeline/scripts/repro-build.sh [--cells L0_-1_0,…]
set -eu
ID=$(node -e "import('/work/tools/pipeline/src/stages/build/manifest.ts').then((m) => console.log(m.makeBuildId('/work')))")
DIR="data/build/$ID"
TMP=$(mktemp -d)
echo "buildId=$ID node=$(node --version)"
for run in 1 2; do
  node tools/pipeline/src/cli.ts build --build-id "$ID" "$@" >/dev/null
  (cd "$DIR" && find . -type f | sort | xargs sha256sum) > "$TMP/run$run.sha"
done
cat "$TMP/run1.sha"
if diff "$TMP/run1.sha" "$TMP/run2.sha"; then
  echo "REPRO: byte-identical ($(wc -l < "$TMP/run1.sha") files)"
else
  echo "REPRO: DIFFERENT" >&2
  exit 1
fi
node tools/pipeline/src/cli.ts validate --build-id "$ID"
