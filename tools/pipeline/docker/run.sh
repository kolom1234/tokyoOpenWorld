#!/usr/bin/env bash
# 파이프라인 컨테이너에서 명령 1개를 실행한다(저장소 → /work). see docs/04-data-pipeline.md §1
# 사용: tools/pipeline/docker/run.sh [--install] <cmd…>
#   --install  컨테이너 전용 node_modules 볼륨에 @sanpo/pipeline 의존성 설치(최초 1회·lock 변경 시)
# 호스트 node_modules(Windows 정션 등)는 리눅스에서 깨지므로 이름 있는 볼륨으로 가린다.
set -euo pipefail

IMAGE="${SANPO_PIPELINE_IMAGE:-sanpo-pipeline:local}"
ROOT="$(cd "$(dirname "$0")/../../.." && (pwd -W 2>/dev/null || pwd))"
NM_DIRS=(node_modules tools/pipeline/node_modules packages/core/node_modules packages/geo/node_modules packages/tile-format/node_modules)

args=(--rm -i -v "${ROOT}:/work" -v sanpo-pnpm-store:/root/.local/share/pnpm/store -w /work)
for d in "${NM_DIRS[@]}"; do
  args+=(-v "sanpo-nm-${d//\//-}:/work/${d}")
done

# Git Bash(MSYS)가 /work 같은 컨테이너 경로를 Windows 경로로 바꾸지 않도록 한다.
export MSYS_NO_PATHCONV=1

if [[ "${1:-}" == "--install" ]]; then
  shift
  docker run "${args[@]}" "$IMAGE" pnpm install --frozen-lockfile --store-dir /root/.local/share/pnpm/store --filter '@sanpo/pipeline...'
fi
if [[ $# -gt 0 ]]; then
  docker run "${args[@]}" "$IMAGE" "$@"
fi
