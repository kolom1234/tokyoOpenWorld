# CODEMAP

<!-- 자동 생성 파일 — `pnpm codemap`(tools/codemap)으로만 갱신한다. 직접 편집 금지. see docs/16-context-protocol.md §5 -->

> 형식: `경로 — 책임(파일 첫 줄 주석) | exports: 심볼…`. **grep으로만 사용**(전체 read 금지). 테스트 파일은 제외.
> 파일 48개.

## apps/worker
- `apps/worker/src/env.ts` — Worker 바인딩 타입(Env). R2·KV는 선택 — 리소스 생성 전 배포를 허용하기 위해 optional. see docs/modules/worker.md | exports: AssetsBinding, WorldBucket, ConfigKv, Env
- `apps/worker/src/headers.ts` — Worker 응답 공통 헤더(격리·보안)의 단일 출처 + JSON 응답 헬퍼. see docs/13-deployment.md §3 | exports: SECURITY_HEADERS, withSecurityHeaders, json
- `apps/worker/src/index.ts` — Worker 엔트리(라우터): /api/*, /world/*는 Worker, 나머지는 Static Assets. see docs/13-deployment.md §4, docs/modules/worker.md | exports: handleRequest, default
- `apps/worker/src/routes/world.ts` — `/world/*`(R2)·`/api/world/current`(KV) 라우트. 바인딩이 없으면 503으로 비활성. see docs/13-deployment.md §4 | exports: storageUnconfigured, handleWorldCurrent, handleWorldData

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
- `packages/geo/src/api.ts` — @sanpo/geo 공개 계약(타입·인터페이스). see docs/modules/geo.md
- `packages/geo/src/index.ts` — @sanpo/geo 공개 엔트리(L1): 좌표 변환(EPSG ↔ WF)·셀 인덱싱. api.ts 재수출 + create* 팩토리만. see docs/modules/geo.md | exports: * from './api.ts'

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
- `packages/tile-format/src/api.ts` — @sanpo/tile-format 공개 계약(타입·인터페이스). see docs/modules/tile-format.md
- `packages/tile-format/src/index.ts` — @sanpo/tile-format 공개 엔트리(L1): TKC 셀 컨테이너 인코더/디코더. api.ts 재수출 + create* 팩토리만. see docs/modules/tile-format.md | exports: * from './api.ts'

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
- `tools/pipeline/src/cli.ts` — 데이터 빌드 CLI 엔트리(`pnpm pipeline <cmd>`). see docs/04-data-pipeline.md, docs/modules/pipeline.md
