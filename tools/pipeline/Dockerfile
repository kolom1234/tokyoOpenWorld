# 데이터 파이프라인 실행 이미지: Node 24 + GDAL + nusamai(PLATEAU GIS Converter) CLI, 모두 고정 버전.
# see docs/04-data-pipeline.md §1, docs/02-tech-stack.md §3, docs/modules/pipeline.md
# 빌드: docker build -t sanpo-pipeline:local tools/pipeline
# 실행: tools/pipeline/docker/run.sh <cmd…> (저장소를 /work에 마운트, node_modules는 컨테이너 전용 볼륨)
# TODO(M03+): osmium-tool, toktx는 해당 단계를 구현하는 태스크에서 고정 버전으로 추가.

ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG GDAL_IMAGE=ghcr.io/osgeo/gdal:ubuntu-small-3.13.3

FROM ${NODE_IMAGE} AS node

FROM ${GDAL_IMAGE}

ARG NUSAMAI_VERSION=v0.1.19
ARG NUSAMAI_SHA256=6bebc9c42830bdbae46ed5573d93a55ff3c8897f89068214d50317c8cb9df14e
ARG PNPM_VERSION=10.34.5

# /usr/bin/time: 스파이크·벤치에서 최대 RSS 측정용. unzip: fetch 단계 압축 해제.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl time unzip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && corepack enable pnpm \
 && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN curl -fsSL -o /tmp/nusamai.tgz \
      "https://github.com/MIERUNE/plateau-gis-converter/releases/download/${NUSAMAI_VERSION}/nusamai-${NUSAMAI_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
 && echo "${NUSAMAI_SHA256}  /tmp/nusamai.tgz" | sha256sum -c - \
 && mkdir -p /opt/nusamai && tar -xzf /tmp/nusamai.tgz -C /opt/nusamai \
 && find /opt/nusamai -type f -name nusamai -exec install -m 0755 {} /usr/local/bin/nusamai \; \
 && rm /tmp/nusamai.tgz \
 && nusamai --version && ogr2ogr --version && node --version && pnpm --version

ENV SANPO_PIPELINE_IMAGE=1 \
    NUSAMAI_VERSION=${NUSAMAI_VERSION}
WORKDIR /work
