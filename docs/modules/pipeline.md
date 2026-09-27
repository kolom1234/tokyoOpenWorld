# tools/pipeline (데이터 빌드 CLI)
Layer: — | Depends: core, geo, tile-format, @gltf-transform/*, meshoptimizer, proj4, recast-navigation, @dgreenheck/ez-tree, @aws-sdk/client-s3 + 외부 바이너리(nusamai, GDAL, osmium, toktx) | 실행: Docker 이미지

## Purpose
원천 공간데이터 → 정규화 → 파생 → TKC 셀/HLOD/전역 파일 → 검증 → R2 퍼블리시. 재현 가능·증분·셀 병렬.
상세: `docs/04-data-pipeline.md`, 포맷: `docs/05-tile-format.md`.

## CLI
`pnpm pipeline <fetch|normalize|derive|build|hlod|validate|publish|gc|fixture|all> --area <id> [--cells …] [--jobs N] [--force] [--env dev|prod]`

## Files
```
src/cli.ts                      명령 파서(구현: normalize --area --cells --source --reader)
src/context.ts                  경로·설정·로거·캐시 키
src/readers/plateau/{index,types,codes,geometry,citygml-sax,citygml-sax-state,citygml-assemble,nusamai}.ts  (ADR-0007)
src/readers/{dem,osm,rail,boundary,wikidata}.ts
src/stages/fetch.ts normalize-*.ts   (normalize-plateau.ts 구현)
src/spike/{plateau-spike,spike-metrics}.ts   M01-T02 A/B 비교 스파이크(재현용 보존)
src/stages/derive/{roads,sidewalks,curbs,terrain-shape,markings/*,props/*,lanes,navmesh,rail/*,audio-zones,lights,facade-params,pois}.ts
src/stages/build/{terrain-mesh,buildings-mesh,roads-mesh,heightfield,collision,instances,assemble,rail-global}.ts
src/stages/hlod/*.ts  materials.ts  interiors.ts  trees/*  characters/*  signage/*  timetables/*  map-tiles.ts
src/stages/validate.ts publish.ts gc.ts fixture.ts
src/lib/{gltf,mesh-ops,polygon,spline,raster,hash,parallel,ndjson-gz}.ts   (polygon·ndjson-gz 구현)
scripts/golden-geo.py
Dockerfile                      Node 24.21.0 + GDAL 3.13.3 + nusamai 0.1.19 (sha256 고정)
docker/run.sh                   컨테이너 실행(저장소 → /work, node_modules는 이름 있는 볼륨; `--install` 최초 1회)
```

## PlateauReader (ADR-0007: citygml-sax 채택)
```ts
interface PlateauReader { readonly name: 'nusamai' | 'citygml-sax'; read(file: string, opts: { sourceId: string }): AsyncIterable<NormalizedFeature> }
type NormalizedFeature = BuildingRecord | RoadRecord;   // 필드: docs/04-data-pipeline.md §4.2 표, 정의: readers/plateau/types.ts
createPlateauReader(impl = 'citygml-sax'); parseCityGmlString(xml, sourceId)   // 후자는 테스트·픽스처용
normalizePlateau({ sourceId, rawRoot, cells, outDir, reader, log })            // → data/normalized/{buildings,roads}/<cellId>.ndjson.gz
```
- 원천 배치: `data/raw/<sourceId>/<zip>` + `data/raw/<sourceId>/extracted/{udx,codelists,…}`.
- 실행: `tools/pipeline/docker/run.sh node tools/pipeline/src/cli.ts normalize --source plateau-shibuya --cells L0_-1_0,…`

## Invariants
- 모든 단계 결정론(정렬·시드). 같은 입력 → 같은 바이트.
- 셀 경계 규칙(04 §6) 준수. 건물 분할 금지.
- 산출 섹션마다 `sources[]` 기록, lock에 없는 소스 사용 시 실패.
- 원천/산출 파일은 git에 넣지 않음(예외: tests/fixtures ≤ 5 MB).
- 외부 바이너리 버전은 Dockerfile에서 고정, 실행 전 `--version` 검사.

## Tests
픽스처 셀 빌드 스냅샷 해시, 경계 이음새 검사, 폴리곤·스플라인 유틸 단위 테스트.
현재: `test/citygml-sax.test.ts`(합성 CityGML: 면 종류·속성·UV·LOD 선택·도로 기능), `test/polygon.test.ts`(클리핑 이음새·보간, gzip 헤더 고정).

## Status
M01-T02: PLATEAU 리더(SAX) + normalize(건물·도로) + 컨테이너. 나머지 단계 미구현.

## Gotchas
- 호스트 pnpm node_modules(Windows 정션)는 리눅스 컨테이너에서 깨짐 → `docker/run.sh`가 볼륨으로 가림. 컨테이너 pnpm은 `--store-dir` 고정(안 하면 저장소 루트에 `.pnpm-store/` 생성).
- nusamai 기본 출력 CRS는 EPSG:4979(타원체고) → A안 비교 시 `--epsg 6697` 필수. ogr2ogr GeoJSON 좌표는 기본 소수 7자리(≈1 cm).
- 바인드 마운트 I/O가 느려 첫 실행(cold)이 2배 가까이 느리다(스파이크 20.9 s vs warm 11.1 s).
