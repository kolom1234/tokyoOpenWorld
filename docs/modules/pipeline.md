# tools/pipeline (데이터 빌드 CLI)
Layer: — | Depends: core, geo, tile-format, @gltf-transform/*, meshoptimizer, earcut, ajv, saxes, proj4, recast-navigation, @dgreenheck/ez-tree, @aws-sdk/client-s3 + 외부 바이너리(nusamai, GDAL, osmium, toktx) | 실행: Docker 이미지

## Purpose
원천 공간데이터 → 정규화 → 파생 → TKC 셀/HLOD/전역 파일 → 검증 → R2 퍼블리시. 재현 가능·증분·셀 병렬.
상세: `docs/04-data-pipeline.md`, 포맷: `docs/05-tile-format.md`.

## CLI
`pnpm pipeline <fetch|normalize|derive|build|hlod|materials|validate|publish|gc|fixture|all> --area <id> [--cells …] [--jobs N] [--force] [--env dev|prod]`

## Files
```
src/cli.ts                      명령 파서(구현: normalize --area --cells --layer plateau|terrain|all --source --reader; build --area --cells --build-id; validate --build-id)
src/context.ts                  경로·설정·로거·캐시 키
src/readers/plateau/{index,types,codes,geometry,citygml-sax,citygml-sax-state,citygml-assemble,nusamai}.ts  (ADR-0007)
src/readers/dem.ts              GSI FGD DEM xml(zip 멤버 스트림) → Float32 타일 + EPSG:6668 VRT (M01-T03)
src/readers/{osm,rail,boundary,wikidata}.ts
src/stages/fetch.ts normalize-*.ts   (normalize-plateau.ts, normalize-terrain.ts 구현)
src/checks/terrain-gsi.ts       수락 검증: dem_1m vs GSI 표고 API(네트워크, CI 제외)
src/spike/{plateau-spike,spike-metrics}.ts   M01-T02 A/B 비교 스파이크(재현용 보존)
src/stages/derive/{roads,sidewalks,curbs,terrain-shape,markings/*,props/*,lanes,navmesh,rail/*,audio-zones,lights,facade-params,pois}.ts
src/stages/build/dem-window.ts   dem_1m.tif 창 읽기(gdal_translate -srcwin, 영역 밖 여유 샘플은 가장자리 복제) + 셀별 259² 창 (M01-T05)
src/stages/build/heightfield.ts  terrain.height(공통 기준 −100 m·0.01 m) (M01-T05)
src/stages/build/terrain-rtin.ts RTIN 정확 오차 단순화 + 경계 강제 (M01-T05, ADR-0018)
src/stages/build/terrain-mesh.ts terrain.mesh(float32 POSITION, int8 NORMAL, _SURF) (M01-T05)
src/stages/build/buildings-mesh.ts buildings.mesh(u16 POSITION·균일 scale, _BLDG, _FACADE, UV0, TEXCOORD_1) + meta.buildings (M01-T05, M03-T04)
src/stages/build/facade-params.ts  용도·높이·층 → `_FACADE`(class·tint·상점·커튼월·창 시드, L0·HLOD 공용, ADR-0030)
src/stages/build/wall-planes.ts    벽 평면 군집(방향 1°·15 cm → u 원점·폭 공유)·벽과 동일 평면 부속물 판정
src/stages/build/manifest.ts     buildId·world.json (M01-T05)
src/stages/build/assemble.ts     셀 TKC 조립 + 영역 빌드(cells.idx·world.json) (M01-T05)
src/stages/build/{roads-mesh,collision,instances,rail-global}.ts   (미구현)
src/stages/hlod/far-buildings.ts  FarBuilding(중심점·OBB·y0·높이·면적·용도) + 줄 형식 + nightFlags (M02-T04, ADR-0024)
src/stages/hlod/tokyo23-lod1{,.worker}.ts  23구 zip `unzip -p` 스트림 → 워커 스레드 → L2 버킷(data/derived/far-buildings)
src/stages/hlod/dem-far.ts        標高タイル dem_png z14 받기(manifest) → WF 8 m 원경 격자, farDemHeight
src/stages/hlod/child-split.ts    childKeys, 자식 지형 패치(RTIN + 스커트), MeshStream, encodeHlod(머티리얼별 프리미티브 + `_CHILD`)
src/stages/hlod/boxes.ts          OBB 박스·블록 매스 기하 / l1.ts(용접 + meshopt simplify) / l2.ts(buildFarLevel) / l3.ts / run.ts(예산 재시도·cells.idx 병합)
src/stages/validate-hlod.ts       HLOD 예산·자식 그룹 검사
src/lib/{geom2d,png}.ts           볼록 껍질·최소 면적 사각형 / 최소 PNG 디코더
src/stages/materials/{library,fetch,encode,run}.ts  `materials`(M03-T01, ADR-0027): content/materials/library.json → ambientCG zip(sha256 lock, `--update-lock`) → ImageMagick(리사이즈·ORM 패킹) → toktx KTX2 배열 3장 + manifest → 캐시 data/derived/materials/<hash> → `--build-id` 설치(shared/materials)
src/stages/validate-materials.ts  manifest 스키마(schemas/materials.schema.json)·파일 크기·KTX2 헤더·그룹 일관성(없으면 건너뜀)
interiors.ts  trees/*  characters/*  signage/*  timetables/*  map-tiles.ts   (미구현)
src/stages/validate.ts validate-seams.ts   스키마(ajv)·해시·예산·이웃 경계 검사 → report.{json,md} (M01-T05)
src/stages/fixture.ts fixture-plateau.ts   tests/fixtures 생성: world-mini(buildArea 2×2 → validate → 복사 + ATTRIBUTION), plateau-mini(CityGML 원문 발췌·DEM 창·스냅샷), `plateauMiniSnapshot` (M01-T07, ADR-0019)
src/stages/publish/{publish,uploaders,targets}.ts   publish·gc(ADR-0026): 파일 수집·검증 → 업로드(s3 SigV4 / api REST, 동시성 16·재시도) → manifest → HEAD 검증 → KV(CURRENT/BUILDS/BUILD_FILES); 대상 = apps/worker/wrangler.jsonc
src/lib/sigv4.ts                AWS SigV4(헤더 서명, 테스트 벡터 일치)
src/lib/{gltf,triangulate,mesh-ops,polygon,spline,raster,hash,parallel,ndjson-gz}.ts   (gltf·triangulate·polygon·ndjson-gz·raster 구현)
scripts/golden-geo.py
scripts/repro-build.sh          같은 컨테이너에서 build 2회 → sha256 비교 → validate
Dockerfile                      Node 24.21.0 + GDAL 3.13.3 + nusamai 0.1.19 + KTX-Software 4.4.2 (sha256 고정) + ImageMagick
docker/run.sh                   컨테이너 실행(저장소 → /work, node_modules는 이름 있는 볼륨; `--install` 최초 1회)
```

## PlateauReader (ADR-0007: citygml-sax 채택)
```ts
interface PlateauReader { readonly name: 'nusamai' | 'citygml-sax'; read(file: string, opts: { sourceId: string }): AsyncIterable<NormalizedFeature> }
type NormalizedFeature = BuildingRecord | RoadRecord;   // 필드: docs/04-data-pipeline.md §4.2 표, 정의: readers/plateau/types.ts
createPlateauReader(impl = 'citygml-sax'); parseCityGmlString(xml, sourceId)   // 후자는 테스트·픽스처용
createCityGmlSaxReader().readChunks(asyncIterableOfStrings, { sourceId })       // 스트림 입력(unzip -p)
normalizePlateau({ sources: [{ sourceId, rawRoot }…], cells, outDir, reader, log })  // → data/normalized/{buildings,roads}/<cellId>.ndjson.gz
                                                                                // 소스들을 한 버킷으로, 같은 메시 파일명은 앞 소스만(都 pref 판 = 메시 단위)
```
- 원천 배치: `data/raw/<sourceId>/<zip>` + `data/raw/<sourceId>/extracted/{udx,codelists,…}`.
- 실행: `tools/pipeline/docker/run.sh node tools/pipeline/src/cli.ts normalize --layer plateau --source plateau-shibuya --cells L0_-1_0,…`

## Terrain (M01-T03)
```ts
normalizeTerrain({ rawDir, outDir, boundsWF, log })   // → data/normalized/terrain/dem_1m.tif (+ writeTerrainMeta → dem_1m.json)
gridOfBounds(b): PrjGrid                              // 픽셀 (col,row) 중심 = (eMin+col, nMax−row) m, 경계 양끝 정점 포함
```
- 순서: DEM1A(bilinear) → 결측만 DEM5A(cubic) → 잔여 결측 `gdal raster fill-nodata`(200 px, 넘으면 실패). 범위 = `--cells` 합집합 또는 area 전체.
- 원천 zip은 풀지 않고 필요한 3차 메시 멤버만 `unzip -p`. 작업 파일은 `data/normalized/terrain/work/`(실행마다 재생성).
- 실행: `docker/run.sh node tools/pipeline/src/cli.ts normalize --layer terrain` → `node tools/pipeline/src/checks/terrain-gsi.ts`

## Build / Validate (M01-T05, ADR-0018)
```ts
buildArea({ area, cells, buildId, normalizedDir, outDir, plateauSources, log, dem? }): Promise<CellBuildStats[]>  // → data/build/<buildId>/{world.json,cells.idx,L0/<ix>/<iz>.tkc}
buildCell({ key, buildId, window, buildings, metaFallbackSources }): Promise<{ tkc, stats }>
rtinTriangulate(h, n /*2^k+1*/, maxError): Uint32Array;  buildTerrainGeometry(w) / encodeTerrainMesh(g);  buildBuildings(records, originWF)
encodeGlb(mesh) / decodeGlb(bytes)   // lib/gltf.ts, meshopt + KHR_mesh_quantization
makeBuildId(repoRoot, date?)  // YYYYMMDD-<git7>-<lock8>, SOURCE_DATE_EPOCH 존중
validateBuild(dir, schemasDir, lockIds): Promise<ValidateReport>;  writeReport(dir, r)  // report.json + report.md(셀 표)
```
- 실행: `docker/run.sh node tools/pipeline/src/cli.ts build --cells …` → `… validate` / 픽스처: `… fixture [--only world-mini|plateau-mini]` / 재현성: `docker/run.sh sh tools/pipeline/scripts/repro-build.sh --cells …`
- 섹션: terrain.mesh·terrain.height(sources gsi-dem), buildings.mesh(건물 source), meta.json(건물 source, 없으면 영역 PLATEAU 소스). 셀 AABB = 지형 ∪ 건물(mm 바깥 반올림).

## HLOD (M02-T04, ADR-0024)
```ts
extractTokyo23({ zipPath, sourceId, extent, derivedDir, log, workers? });  fetchDemTiles(rawDir, extent, log) → manifestSha;  resampleFarDem(rawDir, extent) → FarDem
runHlod({ area, buildId, normalizedDir, derivedDir, outDir, levels, log }) → HlodCellStats[]   // L1(영역 부모)·L2/L3(hlodExtentWF) TKC + cells.idx 병합
buildL1(key, { l0Buildings, dem1m, farDem, far }, ratio);  buildFarLevel(key, far, dem, params)  // → ChildGeometry[16] → encodeHlod
```
- 실행: `docker/run.sh node tools/pipeline/src/cli.ts hlod-prep [--step buildings|dem] [--workers 14]` → `build` → `hlod --build-id <id>` → `validate`.
- 예산: L1 3e6 B, L2/L3 2e6 B(10진). 초과 시 L1 비율 × 0.6ⁿ, L2/L3 박스 × 0.6ⁿ·매스 격자 × 2(≤ 4회).

## Publish (M02-T06, ADR-0026)
- `node tools/pipeline/src/cli.ts publish --build-id <id> --env dev|prod [--set-current] [--verify-url https://<worker>/world] [--uploader s3|api]` — 호스트에서(CLOUDFLARE_API_TOKEN, 선택 R2_ACCESS_KEY_ID/SECRET).
- `… publish --verify-only --verify-url …`(Worker HEAD 전수 검증, `Accept-Encoding: identity`), `… gc --env dev [--apply]`.

## Invariants
- 모든 단계 결정론(정렬·시드). 같은 입력 → 같은 바이트.
- 셀 경계 규칙(04 §6) 준수. 건물 분할 금지.
- 산출 섹션마다 `sources[]` 기록, lock에 없는 소스 사용 시 실패.
- 원천/산출 파일은 git에 넣지 않음(예외: tests/fixtures ≤ 5 MB).
- 외부 바이너리 버전은 Dockerfile에서 고정, 실행 전 `--version` 검사.

## Tests
픽스처 셀 빌드 스냅샷 해시, 경계 이음새 검사, 폴리곤·스플라인 유틸 단위 테스트.
현재: `test/hlod.test.ts`(자식 분할 합집합·예산·박스 외향·매스 피복·simplify 25%·PNG/dem_png·OBB), `test/build-terrain.test.ts`(RTIN 오차 상한·면적·경계 정점, 이웃 셀 높이장 u16·메시 경계 정점 완전 일치, 결정론), `test/fixtures.test.ts`(커밋된 world-mini validate·4 이음새·ATTRIBUTION 스키마, plateau-mini normalize→build 2회 동일 + `expected.json` 스냅샷), `test/build-cell.test.ts`(건물 속성·양자화 오차·외향 법선, 영역 빌드 → validate 무오류·lock 위반 검출, 2회 빌드 바이트 동일), `test/dem.test.ts`(FGD DEM 파싱·startPoint·결측 종류, 격자 정렬, 1A/5A 병합), `test/citygml-sax.test.ts`(합성 CityGML: 면 종류·속성·UV·LOD 선택·도로 기능), `test/polygon.test.ts`(클리핑 이음새·보간, gzip 헤더 고정).

## Status
M01-T02: PLATEAU 리더(SAX) + normalize(건물·도로) + 컨테이너. M01-T03: DEM → dem_1m.tif. M01-T05: build(지형·건물·meta) + validate(스키마·해시·예산·이음새). M01-T07: fixture.
M02-T04: hlod-prep(23구 원경 건물·標高タイル) + hlod(L1–L3) + validate HLOD 검사, normalize 다중 소스. 미구현: fetch, derive, 도로/충돌/인스턴스 섹션, publish, 증분 캐시(`data/build/.cache`), 정확도 샘플·report.html, HLOD 항공사진 지면색.

## Gotchas
- 호스트 pnpm node_modules(Windows 정션)는 리눅스 컨테이너에서 깨짐 → `docker/run.sh`가 볼륨으로 가림. 컨테이너 pnpm은 `--store-dir` 고정(안 하면 저장소 루트에 `.pnpm-store/` 생성).
- nusamai 기본 출력 CRS는 EPSG:4979(타원체고) → A안 비교 시 `--epsg 6697` 필수. ogr2ogr GeoJSON 좌표는 기본 소수 7자리(≈1 cm).
- GSI DEM 2025판은 `srsName="fguuid:jgd2024.bl"`. 수평은 JGD2011과 같아 EPSG:6668로 취급, 표고는 2025 개정 기준(PLATEAU JGD2011 도로면 대비 중앙값 +0.05 m — 무시 가능).
- `data/normalized/**`는 Read 금지(settings deny) → 확인은 컨테이너 명령(gdalinfo 등) 출력으로만.
- 호스트에서 `data/build/**`·`data/normalized/**` 조회는 deny → 결과 확인은 컨테이너 명령(`validate`의 report.md 출력)으로.
- 컨테이너 날짜는 UTC → KST 오전 9시 전 빌드의 buildId 날짜는 전날.
- `buildPlateauMini`는 `readDemWindowFiles`/`writeDemWindowFiles`(dem-window.ts)로 GDAL 없는 DEM 창을 쓴다. 스냅샷의 gzip 섹션 해시는 해제 바이트 기준.
- 바인드 마운트 I/O가 느려 첫 실행(cold)이 2배 가까이 느리다(스파이크 20.9 s vs warm 11.1 s).
