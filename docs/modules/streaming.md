# @sanpo/streaming
Layer: L2 | Depends: core, geo, tile-format, meshoptimizer(디코더) | Used by: apps/game(wiring)

## Purpose
관심점 기반 셀 로딩·디코드·해제. three/render/physics/sim을 모른다. 결과는 `CellPayload`(tile-format 타입, TypedArray)를 `onReady` 콜백으로 단일 전달.
상세 스펙: `docs/06-world-streaming.md` (API 전문은 §9).

## Public API (요약)
`createStreaming(StreamingDeps{bus, log, world{baseUrl, buildId, cellsIndex}, config?, supervisor?|pool?, fetcher?, clock?, initialMode?, initialTier?}) → StreamingService`:
`setInterest, ack, whenReady, stateOf, groundHeightAt, onReady(1개만), onEvicted, requestSections, stats, dispose` (+ `SystemProvider`: phase 50, `init` = 옛 buildId 캐시 삭제).
- **구현됨(M02-T03, ADR-0023)**: `CellState`·`ConsumerId`·`WhenReadyRequest`(M06 사전 4: `holdExclusiveUntil?: Promise<unknown>` — ADR-0060)·`StreamingStats`(states·residentByLevel·queued/fetching/decoding·pendingReady·
  recompute{count,lastMs,maxMs,totalMs}·evicted·failures·cacheBytes·overLimit)·`StreamingDeps`. `StreamingConfig.lifecycle: LifecycleConfig{retryAfterMs 60 s,
  recomputeIntervalMs 250, readyPerFrame 2, evictPerFrame 8}`, `FetchConfig.cacheMaxBytes 1.5e9`, `CacheLike.keys?()`, `Fetcher.cacheBytes?()`.
- **구현됨(M02-T01)**: `api.ts` = `StreamingConfig { interest: InterestConfig; priority: PriorityConfig; residentMax }`(기본값 `internal/config.ts`
  `DEFAULT_STREAMING_CONFIG`, 수치 06 §3–4·ADR-0021). 서비스(`createStreaming`)는 아직 없음(T02–T03).
- 내부 순수 함수(패키지 밖 비공개): `cell-index.ts` `parseCellIndex/createCellIndex → CellIndex{has,get,byteLength,keysAt,extentAt}`,
  `interest.ts` `computeDesired(index, frame, resident, cfg) → {load, keep}`, `planEvictions`, `l0RadiusM/l1RadiusM/levelRule`,
  `priority.ts` `scoreCells/rankCells(candidates, frame, cfg)`, `geometry.ts` `InterestFrame{points, mode, tier, groundHeightAt?}`·거리·뷰 쐐기.
- **구현됨(M02-T02, ADR-0022)**: `StreamingConfig`에 `fetch: FetchConfig{maxConcurrent 8, retries 3, backoffMs 250, cacheStorage}`,
  `decode: DecodeConfig{workers 0=자동, perWorker 2, verifyHash}`. 공개 팩토리(저수준, createStreaming이 조립할 부품):
  `createFetcher(CellFetcherDeps) → Fetcher{fetchCell(key, expectedBytes, signal) → Result<CellFetchResult{bytes, fromCache}, CellFetchError>, invalidate(key)}`,
  `purgeStaleCaches(caches, buildId)`, `cacheName(buildId)`,
  `createDecodePool(DecodePoolDeps{supervisor, log, config, createWorker?}) → DecodePool{decode(bytes, DecodeRequest, signal) → Result<DecodeResult{payload, workerMs}, DecodeError>, stats, dispose}`,
  `DEFAULT_STREAMING_CONFIG`. 테스트 대역용 `FetchLike`·`CacheStorageLike`.
- 내부: `scheduler.ts` `createLoadScheduler({index, fetcher, pool, …, onStage, onDone}) → {request(key, score, sections?), cancel, stageOf, stats}`,
  워커 쪽 `decode.ts` `decodeCell`(기본 섹션에 `props.inst` → `payload.instances.props`·`trees.inst` → `instances.trees`, 버퍼 전송 목록 포함 — M05-T03·T04)·`glb.ts` `decodeGlb`·`decode-host.ts`·`protocol.ts`.
  T03: `service.ts`(조립·프레임 update), `planner.ts` `recompute`(원하는 셀 → 취소 → 순위 요청 → 해제 계획), `lifecycle.ts` `createLifecycle`(상태·보류 payload·ack),
  `ground.ts` `createGroundStore`·`sampleHeightfield`, `waiters.ts`(whenReady·pinned·exclusive), `cell-cache.ts`(Cache Storage 계층)·`cache-lru.ts`(상한 LRU),
  `interest.ts` `inLoadZone`(미룬 해제 재확인).

## Invariants
- 발밑 L0 셀은 항상 최우선.
- `onReady` ≤ 2/프레임, 메인 적용 ≤ 2 ms/프레임.
- 상주 한도(L0 72, **L1 80**, L2 64, L3 16 — ADR-0021)는 소프트 리밋(로드 반경 내 셀은 해제 금지). 해제 반경 = 로드 반경 × 1.25. R0 ≤ 768 m.
- 로드 반경 안·whenReady 대상 셀은 절대 해제하지 않는다(미룬 해제도 실행 직전 재확인). 해제는 프레임당 ≤ 8.
- `live` ⇔ onReady로 넘긴 뒤 render ack. onReady 전 해제된 셀은 onEvicted·`cell/evicted` 없음. 셀당 onReady는 적재 1회에 1번.
- `whenReady({ …, exclusive: true })` 대기 중엔 대상 셀만 새로 요청, 대상 밖 `queued`는 내린다(fetch 중인 것은 유지) — 부팅 첫 표시(ADR-0033).
- `whenReady({ …, exclusive: true, holdExclusiveUntil })`: exclusive를 그 Promise가 끝날(resolve·reject) 때까지 유지 — 대상이 먼저 준비돼도 resolve는 대상 준비 시점 그대로, 선적재만 보류(부팅 선컴파일과 겹치기, M06 사전 4·ADR-0060).
- 진행 중 요청은 해제 반경 밖에서만 취소. failed는 60 s 뒤 재요청 가능(whenReady는 failed를 끝으로 본다).
- 발밑 셀 점수 −1 고정(다른 점수 ≥ 0). 부모가 같은 요청 후보면 자식 점수 ≥ 부모 + 0.001(발밑 면제). `cells.idx`에 없는 셀은 요청 안 함.
- 모드·품질 티어는 `InterestPoint`가 아닌 `InterestFrame`으로 입력(서비스가 `mode/changed`·`quality/changed` 추적).
- `live` = render ack. physics 콜라이더는 `requestSections`로 별도 공급.
- 디코드 결과 배열은 소비자에게 소유권 이전(메인에서 재사용 금지). 예외: heightfield(ground 질의용 보관).
- Cache Storage 이름에 buildId 포함, 부팅 시 타 buildId 삭제.
- 메인 스레드는 fetch 대기·postMessage(transfer)만 — TKC/glb 파싱·gzip·hash32는 전부 워커(ADR-0022). `decode()`로 넘긴 바이트는 분리된다.
- 디코드 결과 배열은 모두 독립 버퍼(서로·입력과 공유 없음). transfer 목록 = `transferList(payload)`(중복 없음).
- 취소된 요청은 결과를 내지 않는다(워커는 단계 경계에서 멈추고 `cancelled`, 메인은 즉시 `aborted`).

## Files
cell-index.ts, interest.ts, priority.ts, geometry.ts, config.ts(순수), scheduler.ts, fetcher.ts, decode-pool.ts, protocol.ts,
decode.worker.ts(엔트리), decode-host.ts, decode.ts, glb.ts, decode-util.ts(워커 쪽),
service.ts, planner.ts, lifecycle.ts, ground.ts, waiters.ts, cell-cache.ts, cache-lru.ts(M02-T03).

## Tests
priority/interest/cell-index 단위, decode(world-mini ↔ 파이프라인 스냅샷 `tests/fixtures/snapshots/world-mini-decode.json`),
decode-pool(가짜 워커 + **실제 worker_threads**로 decode.worker.ts 실행 — `test/support/node-worker-shim.ts`), fetcher(재시도·취소·캐시 대역),
scheduler(순서·동시성·단계별 취소 + HTTP `/fixtures/world-mini` → 캐시 → 워커 스레드 전 경로), e2e `tests/e2e/decode.spec.ts`(Chromium 모듈 워커).
T03: lifecycle(전이·FIFO·failed·정리), service(부팅 순서·onReady ≤ 2/프레임·ack·이벤트·failed 60 s·whenReady pin·취소·재계산 주기·requestSections·dispose),
**service-sim(10분 무작위 이동 — 로드 반경 해제 0·5 s 수렴·누수 0, 기본/좁은 한도)**, service `holdExclusiveUntil`(대상 준비 뒤에도 해제 전 fetch 0), ground(world-mini 경계 연속), cache-lru·fetcher 상한. 대역 `test/support/sim.ts`(가상 시계).

## Status
M02-T01 관심·우선순위, M02-T02 fetch·디코드 워커 풀·로드 큐(ADR-0022), M02-T03 `createStreaming`·lifecycle·ground·캐시 상한(ADR-0023) 완료.
게임 배선(render 어댑터·임시 로더 삭제)은 M02-T05.
M06 사전 4: `WhenReadyRequest.holdExclusiveUntil`(부팅 선컴파일 동안 선적재 보류, ADR-0060).

## Gotchas
- 본문 도중 취소된 응답의 복사본 `body.cancel()`은 취소 사유로 거부된다 → 반드시 catch(`fetcher.cancelBody`, M04-T06 3G 스로틀에서 미처리 거부 발견). 스케줄러 `run()`도 catch.
- `KTX2Loader`는 render 소관(streaming은 텍스처를 다루지 않음 — 셀에는 텍스처 없음).
- AbortController 취소 후 늦게 도착한 워커 결과는 폐기(풀이 요청 id로 비교).
- 워커 기본 팩토리는 `new Worker(new URL('./decode.worker.ts', import.meta.url), {type:'module'})` 리터럴이어야 Vite가 워커 청크를 만든다.
- 워커 파일은 DOM/WebWorker lib 충돌을 피하려고 최소 `WorkerScope` 인터페이스로 `globalThis`를 본다.
- glb는 파이프라인 부분집합만(05 §4). writer를 바꾸면 스냅샷 테스트(`tools/pipeline/test/world-mini-decode.test.ts` `-u`)부터.
