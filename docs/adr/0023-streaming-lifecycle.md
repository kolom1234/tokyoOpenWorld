# ADR-0023: 스트리밍 서비스 수명주기·해제·캐시 상한 (M02-T03)
- Status: Accepted
- Date: 2026-09-29

## Context
M02-T03에서 T01(관심·우선순위 순수 함수)·T02(fetch·디코드 워커·로드 큐)를 `createStreaming`(06 §9)으로 조립했다.
문서가 정하지 않은 것: 재계산 호출 주기(T01에서 `computeDesired` 비용 미측정으로 미룸), 진행 중 요청의 취소 기준, 해제를 한 프레임에
몰아서 할지, `whenReady`가 셀을 어떻게 보장하는지, failed 60 s 재시도의 구현, Cache Storage 1.5 GB 상한(T02에서 미룸)의 순서 기준,
`createStreaming` 의존성(cells.idx·buildId·풀을 누가 주는지).

## Decision
1. **재계산 주기**: 관심점 L0 셀·종류·수, 모드, 품질 티어가 바뀌면 즉시, 그 외 `recomputeIntervalMs = 250`마다(≤ 4 Hz).
   whenReady 등록·해제 때도 즉시. 재계산 = `computeDesired` + `rankCells` + `planEvictions`(+ 취소·요청).
   실측(Node 24, 이 PC, 10분 무작위 이동 시뮬, 합성 전 레벨 격자): **평균 0.41 ms, 워밍업 후 최대 ≈ 2 ms, 첫 호출(JIT 냉간) ≈ 8 ms**
   (첫 호출은 부팅 로딩 화면 중 — Hard Rule 8 허용 범위 밖이지만 플레이 전). 통계는 `stats().recompute`.
2. **진행 중 요청 취소**: 상주뿐 아니라 진행 중(queued/fetching/decoding) 셀도 `computeDesired`의 "보유"로 넘겨, 해제 반경(× 1.25) 안이면 계속 받는다.
   밖으로 나가면 `LoadScheduler.cancel`(AbortController → fetch·백오프·워커 단계 경계 중단) → 상태 기록 삭제(absent).
3. **해제는 프레임 예산으로**: 재계산이 만든 해제 계획을 큐에 두고 프레임당 `evictPerFrame = 8`개만 실행(순간이동 때 수십 셀의 render
   해제 비용을 나눔). 실행 직전 `inLoadZone`(현재 관심점으로 셀 하나만 판정) + whenReady 대상이면 건너뛴다 → 계획 이후 다시 들어온 셀을 해제하지 않는다.
   다음 재계산이 큐를 새 계획으로 교체한다. onReady도 프레임당 `readyPerFrame = 2`(06 §6).
4. **상태 전이 세부**: `ready` = 디코드 완료(onReady 전 보류 포함) + onReady 후 render ack 전. **render ack만 live**(다른 소비자는 기록만).
   onReady 전에 해제된 셀은 payload만 버리고 onEvicted·`cell/evicted`를 내지 않는다(소비자가 본 적 없음).
   onReady 콜백이 없으면 전달을 미룬다(payload 보관) — wiring이 늦게 붙어도 유실 없음. 콜백은 1개(두 번째 등록은 throw).
5. **failed**: fetcher가 재시도 3회 후 포기(또는 디코드 오류) → `failed`(시각 기록). `retryAfterMs = 60 s` 지나면 다시 요청 대상.
   더 원하지 않는 failed 기록은 60 s 뒤 정리(누수 방지). failed는 whenReady를 막지 않는다(live 또는 failed = 끝).
6. **whenReady**: 요청 영역(셀 AABB 수평 거리 ≤ radius, cells.idx에 있는 셀)의 셀을 pinned로 두어 관심점과 무관하게 로드·유지(해제 금지)하고,
   모두 live/failed가 되면 resolve. dispose 시 남은 대기는 resolve.
7. **Cache Storage 상한 LRU**(`FetchConfig.cacheMaxBytes = 1.5e9`, 06 §7): URL별 바이트를 사용 순서(Map 삽입 순서)로 추적, 적중·저장 때 최근으로,
   초과 시 오래된 것부터 `cache.delete`. **세션 간 순서는 `Cache.keys()` 저장 순서(= 처음 저장 순서)로 근사** — 적중 때 다시 쓰면
   셀당 수백 KB 쓰기가 생기므로 하지 않는다. 기존 항목 크기는 부팅 후 백그라운드로 `Content-Length`(없으면 1 MiB 가정)를 읽어 반영(첫 fetch를 막지 않음).
8. **`createStreaming(deps)`**: `{ bus, log, world: { baseUrl, buildId, cellsIndex }, config?, supervisor? | pool?, fetcher?, clock?, initialMode?, initialTier? }`.
   world.json·cells.idx 로드와 buildId 검증은 게임 부트(`world-load.ts`)가 하고 파싱된 `CellsIndex`를 넘긴다. `init()`은 다른 buildId 캐시 삭제.
   모드·티어는 `mode/changed`·`quality/changed` 구독으로 추적(06 §3).

## Consequences
- 10분 무작위 이동 헤드리스 시뮬(`service-sim.test.ts`: 모드 전환·고도 0–900 m·최대 240 m/s·순간이동·fetch 실패 2%)에서
  로드 반경 안 해제 0, 이중 전달 0, 기본 한도 초과 0 ms / 좁은 한도(L0 24·L1 30·L2 30) 최대 480 ms 안에 수렴, 관심점 제거 후 L3만 남고 누수 0.
- 브라우저 실제 수치(재계산·Cache Storage seed 시간)는 M02-T05 배선 후 `?debug=1`·`pnpm perf`로 확인.
- 세션 간 LRU가 FIFO 근사라 오래전에 받았지만 자주 가는 셀이 먼저 지워질 수 있다 → 재방문 시 네트워크 1회(정확성 문제 없음).
