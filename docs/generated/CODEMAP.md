# CODEMAP

<!-- 자동 생성 파일 — `pnpm codemap`(tools/codemap)으로만 갱신한다. 직접 편집 금지. see docs/16-context-protocol.md §5 -->

> 형식: `경로 — 책임(파일 첫 줄 주석) | exports: 심볼…`. **grep으로만 사용**(전체 read 금지). 테스트 파일은 제외.
> 파일 103개.

## apps/game
- `apps/game/src/boot.ts` — 부트 시퀀스(M00 골격): 기능 감지 → core 서비스 → 빈 스케줄러 루프 → 월드 상태 조회. see docs/modules/game.md §부트 시퀀스 | exports: BootFlags, parseFlags, createIdleFrameSource, BootResult, boot
- `apps/game/src/caps.ts` — 기능 감지: WebGPU 어댑터, crossOriginIsolated(SAB), 코어 수 → 격리 모드·디코드 워커 수. see docs/01-architecture.md §2 | exports: WebGpuStatus, IsolationMode, Caps, CapsEnv, capsEnvFromGlobal, detectCaps
- `apps/game/src/debug/stats.ts` — `?debug=1` 전용 stats-gl 패널(동적 import — 기본 번들에 포함하지 않음). see docs/02-tech-stack.md, docs/14-testing-perf.md | exports: createStatsHook
- `apps/game/src/loop.ts` — rAF 프레임 루프 → scheduler.tick. 디버그 계측(stats-gl)은 프레임 훅으로만 끼운다. see docs/01-architecture.md §5 | exports: FrameHook, LoopDeps, Loop, createLoop
- `apps/game/src/main.ts` — 브라우저 엔트리: 상태 화면 마운트 → boot(), 실패 시 오류 화면. see docs/modules/game.md
- `apps/game/src/status-view.ts` — 부트 상태 화면: 기능 감지·월드 상태를 표로 표시(+ e2e용 data-* 속성). HUD는 @sanpo/ui로 대체(M08). see docs/modules/game.md | exports: RowState, StatusRow, describeCaps, describeWorld, StatusView, mountStatusView
- `apps/game/src/world-status.ts` — 부트 4단계: GET /api/world/current?fv= → 활성 월드 빌드 조회. see docs/13-deployment.md §4, §8 | exports: WorldStatus, fetchWorldStatus

## apps/worker
- `apps/worker/src/cache.ts` — 엣지 캐시(`caches.default`) 접근. Workers 밖(Vitest·브라우저)에서는 undefined → 캐시 생략. see docs/13-deployment.md §4 | exports: EdgeCache, edgeCache
- `apps/worker/src/env.ts` — Worker 바인딩 타입(Env). R2·KV는 선택 — 리소스 생성 전 배포를 허용하기 위해 optional. see docs/modules/worker.md | exports: AssetsBinding, WorldRange, WorldObject, WorldObjectBody, WorldBucket, ConfigKv, WorkerContext, Env
- `apps/worker/src/headers.ts` — Worker 응답 공통 헤더(격리·보안)의 단일 출처 + JSON 응답 헬퍼. see docs/13-deployment.md §3 | exports: SECURITY_HEADERS, withSecurityHeaders, json, storageUnconfigured
- `apps/worker/src/index.ts` — Worker 엔트리(라우터): /api/*, /world/*는 Worker, 나머지는 Static Assets. see docs/13-deployment.md §4, docs/modules/worker.md | exports: handleRequest, default
- `apps/worker/src/routes/current.ts` — `GET /api/world/current?fv=<n>`: KV `CURRENT_BUILD:v<n>` → 활성 buildId·baseUrl. see docs/13-deployment.md §4, §8 | exports: handleWorldCurrent
- `apps/worker/src/routes/world.ts` — `/world/<buildId>/<path>` → 엣지 캐시 → R2(Range·조건부). 200 전체 응답만 캐시. see docs/13-deployment.md §4 | exports: contentRange, handleWorldData
- `apps/worker/src/validate.ts` — 요청 입력 검증: buildId 형식, /world 경로(경로 조작 차단), formatVersion 쿼리. see docs/13-deployment.md §4 | exports: BUILD_ID_RE, isValidBuildId, parseWorldPath, parseFormatVersion

## packages/audio
- `packages/audio/src/api.ts` — @sanpo/audio 공개 계약(타입·인터페이스). see docs/modules/audio.md
- `packages/audio/src/index.ts` — @sanpo/audio 공개 엔트리(L2): WebAudio 앰비언스·3D 사운드. api.ts 재수출 + create* 팩토리만. see docs/modules/audio.md | exports: * from './api.ts'

## packages/core
- `packages/core/src/api.ts` — @sanpo/core 공개 계약(타입·인터페이스·상수). 구현은 internal/*, 재수출은 index.ts. see docs/modules/core.md | exports: EventMap, EventName, Vec3d, Vec3, Quat, Result, CellKey, CellLevel, CellId, Unsubscribe, EventBus, LogLevel, LogSink, Logger, LoggerOptions, CameraState, PlayerState, FrameContext, GameSystem, SystemProvider, FrameSource, Scheduler, SchedulerDeps, Rng, WORLD_SEED, DeepPartial, WorkerFactory, SupervisorOptions, WorkerErrorMessage, SupervisedWorkerState, SupervisedWorker, WorkerSupervisor, WorkerSupervisorDeps, ModeId, QualityTier, I18nKey, InterestPoint, WeatherParams, SeasonParams, EnvironmentState, SharedInstanceBuffer, GroundQuery, TrainInfo
- `packages/core/src/events.ts` — 전역 이벤트 목록(EventMap) 단일 정의 파일. 이벤트 추가는 여기서만. see docs/01-architecture.md §6 | exports: EventMap, EventName
- `packages/core/src/index.ts` — @sanpo/core 공개 엔트리(L0): 공통 타입·이벤트버스·로거·rng·설정. api.ts 재수출 + 팩토리/순수 함수. see docs/modules/core.md | exports: * from './api.ts', cellIdString, packCellKey, unpackCellKey, mergeConfig, createEventBus, hash32, createLogger, clamp, degToRad, lerp, quatCopy, quatFromAxisAngle, quatFromYaw, quatIdentity, quatMultiply, quatNormalize, quatSet, quatSlerp, radToDeg, vec3, vec3Add, vec3AddScaled, vec3ApplyQuat, vec3Copy, vec3Cross, vec3Distance, vec3DistanceSq, vec3Dot, vec3Length, vec3LengthSq, vec3Lerp, vec3Normalize, vec3Scale, vec3Set, vec3Sub, err, mapResult, ok, unwrapOr, createRng, createScheduler, MAX_DT_REAL_S, createWorkerSupervisor
- `packages/core/src/internal/cell-key.ts` — 셀 키 pack/unpack/문자열화(53-bit 안전 정수). 레이아웃 변경 = 캐시·세이브 호환 파괴 → ADR 필요. see docs/01-architecture.md §8 | exports: packCellKey, unpackCellKey, cellIdString
- `packages/core/src/internal/config.ts` — 설정 딥 머지(기본값 + 오버라이드). see docs/15-conventions.md §8 | exports: mergeConfig
- `packages/core/src/internal/event-bus.ts` — TypedEventBus: 동기 dispatch, 핸들러 예외 격리. 이벤트 목록은 ../events.ts. see docs/01-architecture.md §6 | exports: createEventBus
- `packages/core/src/internal/hash.ts` — hash32: 파트 목록 → 32-bit 결정론 해시(xxHash32 라운드·아발란시 계열). see docs/15-conventions.md §7 | exports: hash32
- `packages/core/src/internal/logger.ts` — 레벨·스코프 태그·싱크를 가진 로거. console 직접 사용은 이 파일의 기본 싱크만 허용. see docs/15-conventions.md §5 | exports: createLogger
- `packages/core/src/internal/math.ts` — Vec3d/Vec3/Quat 연산. 핫패스용으로 out 파라미터에 기록하고 out을 반환(할당 없음). see docs/15-conventions.md §4 | exports: degToRad, radToDeg, clamp, lerp, vec3, vec3Set, vec3Copy, vec3Add, vec3Sub, vec3Scale, vec3AddScaled, vec3Dot, vec3Cross, vec3LengthSq, vec3Length, vec3DistanceSq, vec3Distance, vec3Normalize, vec3Lerp, quatIdentity, quatSet, quatCopy, quatFromAxisAngle, quatFromYaw, quatMultiply, quatNormalize, vec3ApplyQuat, quatSlerp
- `packages/core/src/internal/result.ts` — Result<T, E> 생성·소비 헬퍼. see docs/15-conventions.md §5 | exports: ok, err, unwrapOr, mapResult
- `packages/core/src/internal/rng.ts` — xoshiro128** 결정론 난수(32-bit 정수 연산만 → 플랫폼 무관). see docs/15-conventions.md §7 | exports: createRng
- `packages/core/src/internal/scheduler.ts` — 프레임 스케줄러: phase 오름차순 실행, dtReal 클램프, FrameContext 구성. see docs/01-architecture.md §5 | exports: MAX_DT_REAL_S, createScheduler
- `packages/core/src/internal/worker-supervisor.ts` — 워커 생성·오류 감시·지수 백오프 재시작. see docs/15-conventions.md §5–6 | exports: createWorkerSupervisor

## packages/geo
- `packages/geo/src/api.ts` — @sanpo/geo 공개 계약(타입·상수). 구현은 internal/*, 재수출은 index.ts. see docs/modules/geo.md, docs/01-architecture.md §7–8 | exports: WORLD_ORIGIN, CELL_SIZES, CELL_FANOUT, LonLat, PrjCoord, CellBoundsWF, LonLatBBox, CellLevel
- `packages/geo/src/index.ts` — @sanpo/geo 공개 엔트리(L1): 좌표 변환(EPSG ↔ WF)·셀 인덱싱. api.ts 재수출 + 구현 함수. see docs/modules/geo.md | exports: * from './api.ts', lonLatBBoxOfWF, cellBoundsWF, cellOf, cellOriginWF, childrenOf, hlodChildIndex, parentOf, gridConvergenceDeg, trueToGridAzimuthDeg, jisMesh3CodesInBBox, jisMesh3Of, lonLatToPrj, lonLatToWF, prjToLonLat, prjToWF, wfToLonLat, wfToPrj
- `packages/geo/src/internal/bbox.ts` — WF 사각형 → 위경도 외접 상자. 파이프라인 원천 조회(fetch) 범위 산출용. see docs/04-data-pipeline.md, docs/modules/geo.md | exports: lonLatBBoxOfWF
- `packages/geo/src/internal/cells.ts` — WF 셀 인덱싱(L0–L3), 부모/자식, HLOD 자식 인덱스. 음수 인덱스는 floor 기반. see docs/01-architecture.md §8 | exports: cellOf, cellOriginWF, cellBoundsWF, parentOf, childrenOf, hlodChildIndex
- `packages/geo/src/internal/convergence.ts` — 자오선 수렴각(도북 − 진북)과 방위각 보정. sim이 태양 방위를 도북 기준으로 바꿀 때 쓴다. see docs/01-architecture.md §7 | exports: gridConvergenceDeg, trueToGridAzimuthDeg
- `packages/geo/src/internal/crs-defs.ts` — EPSG 정의 문자열 고정(외부 조회 금지). pyproj(PROJ 9.5) `CRS.to_proj4()` 출력과 동일한 파라미터. see docs/modules/geo.md | exports: DEF_EPSG_6668, DEF_EPSG_6697, DEF_EPSG_6677
- `packages/geo/src/internal/jis-mesh.ts` — JIS X 0410 지역 메시(3차, ≈1 km) 코드. PLATEAU 원천 파일은 3차 메시 단위로 나뉜다. see docs/modules/geo.md | exports: jisMesh3Of, jisMesh3CodesInBBox
- `packages/geo/src/internal/transforms.ts` — GEO(EPSG:6668/6697) ↔ PRJ(EPSG:6677) ↔ WF 변환. 좌표계 변환의 유일한 구현. see docs/01-architecture.md §7 | exports: lonLatToPrj, prjToLonLat, prjToWF, wfToPrj, lonLatToWF, wfToLonLat

## packages/input
- `packages/input/src/api.ts` — @sanpo/input 공개 계약(타입·인터페이스). see docs/modules/input.md
- `packages/input/src/index.ts` — @sanpo/input 공개 엔트리(L2): 액션 맵(키보드/마우스/게임패드). api.ts 재수출 + create* 팩토리만. see docs/modules/input.md | exports: * from './api.ts'

## packages/physics
- `packages/physics/src/api.ts` — @sanpo/physics 공개 계약(타입·인터페이스). see docs/modules/physics.md
- `packages/physics/src/index.ts` — @sanpo/physics 공개 엔트리(L2): Jolt 워커 호스트·캐릭터/차량/자전거. api.ts 재수출 + create* 팩토리만. see docs/modules/physics.md | exports: * from './api.ts'

## packages/render
- `packages/render/src/api.ts` — @sanpo/render 공개 계약(타입·인터페이스). see docs/modules/render.md
- `packages/render/src/index.ts` — @sanpo/render 공개 엔트리(L3): WebGPU 렌더러·머티리얼·조명·대기·포스트. api.ts 재수출 + create* 팩토리만. see docs/modules/render.md | exports: * from './api.ts'

## packages/sim
- `packages/sim/src/api.ts` — @sanpo/sim 공개 계약(타입·인터페이스). see docs/modules/sim.md
- `packages/sim/src/index.ts` — @sanpo/sim 공개 엔트리(L3): 시계·날씨·군중·교통·열차. api.ts 재수출 + create* 팩토리만. see docs/modules/sim.md | exports: * from './api.ts'

## packages/streaming
- `packages/streaming/src/api.ts` — @sanpo/streaming 공개 계약(타입·인터페이스). see docs/modules/streaming.md
- `packages/streaming/src/index.ts` — @sanpo/streaming 공개 엔트리(L2): 셀 로딩/언로딩·우선순위·캐시. api.ts 재수출 + create* 팩토리만. see docs/modules/streaming.md | exports: * from './api.ts'

## packages/tile-format
- `packages/tile-format/src/api.ts` — @sanpo/tile-format 공개 계약: 포맷 상수·섹션 레지스트리·헤더/바이너리 모델·셀 데이터 모델. see docs/05-tile-format.md, docs/modules/tile-format.md | exports: TKC_MAGIC, FORMAT_VERSION, TKC_ALIGN, TKC_PREAMBLE_BYTES, CELLS_INDEX_MAGIC, JCOL_MAGIC, JCOL_VERSION, LANES_MAGIC, LANES_VERSION, LANE_NO_SIGNAL, HEIGHTFIELD_SIZE, HEIGHTFIELD_STEP_M, HEIGHTFIELD_BASE_M, SectionCodec, SectionSpec, SECTION_REGISTRY, SectionType, TkcErrorCode, TkcError, Vec3Tuple, SectionEntry, CellStats, CellHeader, CellHeaderInput, TkcSectionInput, TkcReader, CELL_FLAG, CellsIndexEntry, CellsIndexRecord, CellsIndex, JCOL_MATERIAL, JCOL_FLAG, JcolKind, JcolTriMesh, JcolConvexHull, JcolBox, JcolRound, JcolShape, LaneGraphChunk, DecodedMesh, MeshSlot, CellPayload, HeightfieldData, PropBatch, TreeBatch, LightRecord, AudioZones, I18nText, MetaBuilding, PoiKind, MetaPoi, MetaPlaceName, MetaSignal, InteractableRecord, CellMeta
- `packages/tile-format/src/index.ts` — @sanpo/tile-format 공개 엔트리(L1): TKC 셀 컨테이너·cells.idx·JCOL·lanes·terrain.height 인코더/디코더. api.ts 재수출 + 순수 함수. see docs/modules/tile-format.md | exports: * from './api.ts', readCellsIndex, tkcHash32, writeCellsIndex, gunzip, gzip, parseHeightfield, quantizeHeightfield, writeHeightfield, parseJcol, writeJcol, parseLanes, writeLanes, isSectionType, sectionHash, readTkc, verifyTkc, writeTkc
- `packages/tile-format/src/internal/bytes.ts` — 리틀엔디언 바이트 쓰기/읽기 헬퍼(범위 검사, 정렬 시 zero-copy typed view). see docs/05-tile-format.md (모든 수치 LE) | exports: fail, ByteWriter, ByteReader, asBytes, allFinite
- `packages/tile-format/src/internal/cells-index.ts` — cells.idx 인코더/디코더 + .tkc 파일 hash32. 레코드 16 B, (level, iz, ix) 오름차순. see docs/05-tile-format.md §5 | exports: writeCellsIndex, readCellsIndex, tkcHash32
- `packages/tile-format/src/internal/gzip.ts` — gzip/gunzip — Compression/DecompressionStream(브라우저·워커·Node 22+ 공통). see docs/05-tile-format.md §4 (gzip 코덱) | exports: gzip, gunzip
- `packages/tile-format/src/internal/header-check.ts` — 런타임 헤더 구조 검사(ajv 없이, schemas/cell-header.schema.json의 부분집합) + 정규 직렬화. see docs/05-tile-format.md §3 | exports: checkHeader, canonicalHeaderJson
- `packages/tile-format/src/internal/heightfield.ts` — terrain.height(gzip 해제 후) 인코더/디코더 + 미터 높이 → u16 양자화. see docs/05-tile-format.md §4 (terrain.height) | exports: writeHeightfield, parseHeightfield, quantizeHeightfield
- `packages/tile-format/src/internal/jcol.ts` — JCOL(collision.bin 압축 해제 후) 인코더/디코더. 셀 로컬 좌표, f32. see docs/05-tile-format.md §6, docs/08-physics.md §3 | exports: writeJcol, parseJcol
- `packages/tile-format/src/internal/lanes.ts` — lanes.bin(gzip 해제 후) 인코더/디코더. SoA 청크, 참조 무결성(노드 인덱스·점 범위·신호 그룹) 검사. see docs/05-tile-format.md §7 | exports: writeLanes, parseLanes
- `packages/tile-format/src/internal/sections.ts` — 섹션 레지스트리 조회·섹션 해시·16바이트 정렬 유틸. see docs/05-tile-format.md §3–4 | exports: HASH_RE, isSectionType, sectionSpec, sectionHash, align16
- `packages/tile-format/src/internal/tkc-reader.ts` — TKC v1 디코더: 프리앰블·헤더 검사, 섹션 범위/정렬/겹침 검사, 미지 섹션 무시, 원본 버퍼 view 제공. see docs/05-tile-format.md §3, §8 | exports: readTkc, verifyTkc
- `packages/tile-format/src/internal/tkc-writer.ts` — TKC v1 인코더: 섹션 type 사전순 배치, 16바이트 정렬, 고정 키 순서 헤더 JSON(결정론). see docs/05-tile-format.md §3 | exports: writeTkc
- `packages/tile-format/src/internal/xxh64.ts` — XXH64(seed 0) — 섹션 해시·cells.idx hash32. BigInt 없이 u32 hi/lo 쌍 연산(파이프라인 처리량). see docs/05-tile-format.md §3, §5 | exports: xxh64Hex, xxh64Low32

## packages/traversal
- `packages/traversal/src/api.ts` — @sanpo/traversal 공개 계약(타입·인터페이스). see docs/modules/traversal.md
- `packages/traversal/src/index.ts` — @sanpo/traversal 공개 엔트리(L3): 이동 모드 상태기계·카메라 리그. api.ts 재수출 + create* 팩토리만. see docs/modules/traversal.md | exports: * from './api.ts'

## packages/ui
- `packages/ui/src/api.ts` — @sanpo/ui 공개 계약(타입·인터페이스). see docs/modules/ui.md
- `packages/ui/src/index.ts` — @sanpo/ui 공개 엔트리(L4): Preact HUD/메뉴/지도. api.ts 재수출 + create* 팩토리만. see docs/modules/ui.md | exports: * from './api.ts'

## scripts
- `scripts/check-asset-size.ts` — 정적 에셋 한도 게이트(`pnpm check:assets [dir]`): 파일당 25 MiB, 파일 수 20,000(Workers Free). see docs/13-deployment.md §2
- `scripts/check-records.ts` — PR 기록 누락 게이트(`pnpm check:records --base <ref>`): api.ts↔모듈 카드(실패), 코드↔PROGRESS.md(경고). see docs/16-context-protocol.md §3
- `scripts/check-size.ts` — 크기 제한 게이트(`pnpm check:size`): TS 파일 400줄·함수 60줄, 모듈 카드 150줄, docs 400줄, CLAUDE.md 200줄. see docs/15-conventions.md §2
- `scripts/lib/files.ts` — 저장소 파일 워커(node_modules·dist·데이터 산출물 제외) + CI 출력 헬퍼. scripts/check-* 공용. | exports: listFiles, report
- `scripts/lib/records-rules.ts` — PR 기록 누락 검사 규칙(순수 함수): api.ts ↔ 모듈 카드, 코드 ↔ PROGRESS.md. see docs/16-context-protocol.md §3–4 | exports: RecordsReport, isCodePath, checkRecords
- `scripts/lib/size-rules.ts` — 파일·함수·문서 크기 제한 규칙(순수 함수). see docs/15-conventions.md §2, docs/14-testing-perf.md §5 | exports: SIZE_LIMITS, SizeViolation, countLines, isTestPath, bodyLines, findLongFunctions, checkSourceText, docLimitFor, checkDocText

## tools/codemap
- `tools/codemap/src/collect.ts` — CODEMAP 대상 소스 파일 수집(테스트·빌드 산출물 제외, 경로 정렬). see docs/16-context-protocol.md §5 | exports: CODEMAP_ROOTS, comparePaths, collectSourceFiles
- `tools/codemap/src/extract.ts` — TS 컴파일러 API(구문 트리만)로 파일 첫 줄 책임 주석·export 심볼 추출. see docs/16-context-protocol.md §5 | exports: FileInfo, extractSummary, extractFileInfo
- `tools/codemap/src/index.ts` — CODEMAP 생성기 엔트리(`pnpm codemap [--check]`) → docs/generated/CODEMAP.md. see docs/16-context-protocol.md §5 | exports: CODEMAP_PATH, generateCodemap
- `tools/codemap/src/render.ts` — CODEMAP.md 마크다운 렌더링(패키지별 그룹, 타임스탬프 없음 → 재생성 결과가 결정론적). see docs/16-context-protocol.md §5 | exports: CodemapEntry, groupOf, renderLine, renderCodemap

## tools/pipeline
- `tools/pipeline/src/checks/terrain-gsi.ts` — M01-T03 수락 검증: dem_1m.tif 표고 vs 地理院地図 표시값(GSI 표고 API) 비교 + GDAL/@sanpo/geo 투영 일치 확인. 네트워크 필요(CI 제외).
- `tools/pipeline/src/cli.ts` — 데이터 빌드 CLI 엔트리(`pnpm pipeline <stage> …`). see docs/04-data-pipeline.md §2, docs/modules/pipeline.md
- `tools/pipeline/src/lib/gltf.ts` — 셀 glb 섹션 인코드/디코드: gltf-transform 문서 → EXT_meshopt_compression + KHR_mesh_quantization glb. see docs/05-tile-format.md §4 (glb), docs/adr/0018-cell-mesh-build.md | exports: GlbArray, GlbAttribute, GlbPrimitive, GlbMesh, DecodedGlb, encodeGlb, decodeGlb
- `tools/pipeline/src/lib/ndjson-gz.ts` — 결정론적 ndjson.gz 입출력: 키 정렬된 레코드 → gzip(헤더 mtime=0, OS=255 고정). see docs/04-data-pipeline.md §1(재현성) | exports: writeNdjsonGz, readNdjsonGz
- `tools/pipeline/src/lib/polygon.ts` — 폴리곤 유틸: 셀 경계(축정렬 XZ 사각형) 클리핑. 도로·지형처럼 셀 경계에서 자르는 레이어용. see docs/04-data-pipeline.md §4.2, §6 | exports: ringAreaXZ, clipRingsToRect
- `tools/pipeline/src/lib/raster.ts` — 래스터 유틸: 투영 격자 정의(PRJ 정수 m = 픽셀 중심), Float32 raw 입출력, GDAL VRT 기록, 결측 병합·통계. see docs/04-data-pipeline.md §4.2(terrain), §6 | exports: PrjGrid, geoTransformOf, targetExtentOf, readFloat32, writeGridVrt, FillStats, mergeWithFallback, ValueStats, valueStats
- `tools/pipeline/src/lib/triangulate.ts` — 3D 평면 폴리곤(외곽 + 구멍) 삼각분할: Newell 법선 → 지배 축 투영 → earcut → 법선 방향으로 감기 정렬. see docs/04-data-pipeline.md §4.4-2 | exports: Vec3, Triangulated, newellNormal, triangulateRings
- `tools/pipeline/src/readers/dem.ts` — GSI 基盤地図情報 数値標高モデル(JPGIS GML, DEM1A/5A 등) 리더: zip 속 3차 메시 xml → Float32 격자 + GDAL용 VRT. see docs/04-data-pipeline.md §4.2(terrain) | exports: DEM_NODATA, DemTile, parseFgdDem, listDemZip, meshOfMember, readZipMember, writeTileVrt
- `tools/pipeline/src/readers/plateau/citygml-assemble.ts` — SAX 파서가 모은 건물·도로 컨텍스트 → 정규화 레코드(LOD 선택 규칙). see docs/04-data-pipeline.md §4.2 | exports: BuildingCtx, AreaCtx, RoadCtx, finishBuilding, finishRoad
- `tools/pipeline/src/readers/plateau/citygml-sax-state.ts` — B안 CityGML 스트리밍 파서의 상태기계: SAX 이벤트 → 건물·도로 레코드. 드라이버는 citygml-sax.ts. see docs/adr/0007-plateau-reader.md | exports: SaxStats, CityGmlState
- `tools/pipeline/src/readers/plateau/citygml-sax.ts` — B안 PlateauReader: saxes 스트리밍 파서로 CityGML을 직접 읽는다(외부 바이너리 없음). see docs/adr/0007-plateau-reader.md | exports: CityGmlSaxReader, createCityGmlSaxReader, parseCityGmlString
- `tools/pipeline/src/readers/plateau/codes.ts` — PLATEAU 코드리스트 → 게임 레이어 축약값. 원 코드는 레코드에 보존한다. see docs/04-data-pipeline.md §4.2 | exports: TrafficAreaType, roadFunctionOf, knownNumber
- `tools/pipeline/src/readers/plateau/geometry.ts` — PLATEAU 기하 공통 유틸: EPSG:6697 좌표열 → WF 링, 면 법선 분류, 중심점. see docs/04-data-pipeline.md §4.2 | exports: latLonHToWF, lonLatHToWF, parsePosList, dropClosingPoint, newellNormal, ringNormalY, polygonArea3D, classifyByNormal, centroidXZ
- `tools/pipeline/src/readers/plateau/index.ts` — PLATEAU 리더 진입점: 공통 타입 재수출 + 구현 선택. 채택안(ADR-0007) = citygml-sax. see docs/04-data-pipeline.md §4.2 | exports: createCityGmlSaxReader, parseCityGmlString, createNusamaiReader, * from './types.ts', createPlateauReader
- `tools/pipeline/src/readers/plateau/nusamai.ts` — A안 PlateauReader(스파이크 비교용): nusamai CLI → GeoPackage(EPSG:6697) → ogr2ogr GeoJSONSeq → 레코드. see docs/adr/0007-plateau-reader.md | exports: createNusamaiReader
- `tools/pipeline/src/readers/plateau/types.ts` — PLATEAU 리더 공통 계약: 정규화 레코드 타입 + `PlateauReader` 인터페이스(구현 교체 가능). see docs/04-data-pipeline.md §4.2, docs/adr/0007-plateau-reader.md | exports: SurfaceKind, RoadFunction, RingsWF, SurfaceRecord, BuildingRecord, RoadRecord, NormalizedFeature, PlateauReadOptions, PlateauReader
- `tools/pipeline/src/spike/plateau-spike.ts` — M01-T02 스파이크 CLI: A안(nusamai)·B안(citygml-sax)을 같은 3×3 셀로 돌려 비교한다. 결과 요약은 docs/adr/0007-plateau-reader.md | exports: SPIKE_CELLS
- `tools/pipeline/src/spike/spike-metrics.ts` — M01-T02 스파이크 비교 지표: 보존(gml:id·속성·면 종류·텍스처·도로 기능), 좌표 일치, 규모. see docs/adr/0007-plateau-reader.md | exports: RunStats, compareOutputs
- `tools/pipeline/src/stages/build/assemble.ts` — L0 셀 조립: terrain.mesh + terrain.height + buildings.mesh + meta.json → TKC, 영역 빌드(cells.idx·world.json). see docs/04-data-pipeline.md §4.4, docs/05-tile-format.md §1–3 | exports: CellBuildStats, CellBuildInput, buildCell, AreaBuildInput, unionBounds, buildArea
- `tools/pipeline/src/stages/build/buildings-mesh.ts` — buildings.mesh 섹션 + meta.buildings: 건물 면 삼각분할(평면 법선) → u16 양자화(균일 스케일) → glb. see docs/04-data-pipeline.md §4.4-2, docs/05-tile-format.md §4 | exports: BUILDING_MATERIAL, Aabb, BuildingsBuild, quantizePositions, buildBuildings
- `tools/pipeline/src/stages/build/dem-window.ts` — dem_1m.tif에서 셀 빌드용 높이 창 읽기(GDAL) + 셀별 (257+2m)² 부분 창 추출. see docs/04-data-pipeline.md §4.4, §6 | exports: CELL_SIZE_M, DEM_MARGIN, DemWindow, CellWindow, readDemWindow, cellWindow, sampleAt
- `tools/pipeline/src/stages/build/heightfield.ts` — terrain.height 섹션: 셀 창(257²) → 공통 기준·스텝 양자화 → writeHeightfield → gzip. see docs/05-tile-format.md §4 (terrain.height), docs/adr/0018-cell-mesh-build.md | exports: cellHeightfield, encodeTerrainHeight
- `tools/pipeline/src/stages/build/manifest.ts` — 빌드 식별·매니페스트: buildId(YYYYMMDD-<git7>-<lock8>), world.json 직렬화. see docs/04-data-pipeline.md §2, docs/05-tile-format.md §2 | exports: AreaDef, gitShort, lockHash8, buildDate, makeBuildId, createdAtOf, worldJson
- `tools/pipeline/src/stages/build/terrain-mesh.ts` — terrain.mesh 섹션: 1 m 격자 → RTIN 단순화(정확 오차 ≤ 5 cm, 경계 정점 잠금) → meshopt 재정렬 → glb. see docs/04-data-pipeline.md §4.4-1, §6, docs/adr/0018-cell-mesh-build.md | exports: TERRAIN_SIMPLIFY_ERROR_M, TERRAIN_MATERIAL, SURF_DEFAULT, TerrainGeometry, remapVertices, buildTerrainGeometry, encodeTerrainMesh
- `tools/pipeline/src/stages/build/terrain-rtin.ts` — 지형 단순화: RTIN(직각 이등변 삼각형 이분 계층) + 정확 오차(삼각형 내부 모든 격자 샘플) + 경계 정점 강제. see docs/04-data-pipeline.md §4.4-1, §6, docs/adr/0018-cell-mesh-build.md | exports: rtinTriangulate
- `tools/pipeline/src/stages/normalize-plateau.ts` — normalize 단계(PLATEAU): CityGML → WF 레코드 → L0 셀 버킷 → data/normalized/{buildings,roads}/<cellId>.ndjson.gz. see docs/04-data-pipeline.md §4.2 | exports: NormalizePlateauInput, NormalizePlateauResult, plateauFilesForCells, normalizePlateau
- `tools/pipeline/src/stages/normalize-terrain.ts` — normalize 단계(지형): GSI DEM1A(주) + DEM5A(결측 채움) → GDAL 재투영(EPSG:6677, 1 m) → 잔여 결측 보간 → data/normalized/terrain/dem_1m.tif. see docs/04-data-pipeline.md §4.2(terrain), §6 | exports: NormalizeTerrainInput, GradeReport, NormalizeTerrainResult, gridOfBounds, normalizeTerrain, writeTerrainMeta, hasDemSources
- `tools/pipeline/src/stages/validate-seams.ts` — validate: 이웃 셀 지형 경계 완전 일치 검사(terrain.height u16 행·열, terrain.mesh 경계 정점). see docs/04-data-pipeline.md §4.6, §6 | exports: CellTerrain, SeamReport, edgeVertices, checkSeams
- `tools/pipeline/src/stages/validate.ts` — validate 단계: 스키마(world.json·셀 헤더·meta.json, ajv) + cells.idx 일치 + 섹션 해시 + 예산 + 경계 이음새 → report. see docs/04-data-pipeline.md §4.6 | exports: BUDGET, CellReport, ValidateReport, createValidators, validateBuild, reportMarkdown, writeReport
