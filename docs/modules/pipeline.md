# tools/pipeline (데이터 빌드 CLI)
Layer: — | Depends: core, geo, tile-format, @gltf-transform/*, meshoptimizer, proj4, recast-navigation, @dgreenheck/ez-tree, @aws-sdk/client-s3 + 외부 바이너리(nusamai, GDAL, osmium, toktx) | 실행: Docker 이미지

## Purpose
원천 공간데이터 → 정규화 → 파생 → TKC 셀/HLOD/전역 파일 → 검증 → R2 퍼블리시. 재현 가능·증분·셀 병렬.
상세: `docs/04-data-pipeline.md`, 포맷: `docs/05-tile-format.md`.

## CLI
`pnpm pipeline <fetch|normalize|derive|build|hlod|validate|publish|gc|fixture|all> --area <id> [--cells …] [--jobs N] [--force] [--env dev|prod]`

## Files
```
src/cli.ts                      명령 파서
src/context.ts                  경로·설정·로거·캐시 키
src/readers/{plateau/*,dem,osm,rail,boundary,wikidata}.ts
src/stages/fetch.ts normalize-*.ts
src/stages/derive/{roads,sidewalks,curbs,terrain-shape,markings/*,props/*,lanes,navmesh,rail/*,audio-zones,lights,facade-params,pois}.ts
src/stages/build/{terrain-mesh,buildings-mesh,roads-mesh,heightfield,collision,instances,assemble,rail-global}.ts
src/stages/hlod/*.ts  materials.ts  interiors.ts  trees/*  characters/*  signage/*  timetables/*  map-tiles.ts
src/stages/validate.ts publish.ts gc.ts fixture.ts
src/lib/{gltf,mesh-ops,polygon,spline,raster,hash,parallel}.ts
scripts/golden-geo.py
Dockerfile
```

## Invariants
- 모든 단계 결정론(정렬·시드). 같은 입력 → 같은 바이트.
- 셀 경계 규칙(04 §6) 준수. 건물 분할 금지.
- 산출 섹션마다 `sources[]` 기록, lock에 없는 소스 사용 시 실패.
- 원천/산출 파일은 git에 넣지 않음(예외: tests/fixtures ≤ 5 MB).
- 외부 바이너리 버전은 Dockerfile에서 고정, 실행 전 `--version` 검사.

## Tests
픽스처 셀 빌드 스냅샷 해시, 경계 이음새 검사, 폴리곤·스플라인 유틸 단위 테스트.

## Status
미구현 (M01부터 단계적).
