# 06 — World Streaming (`@sanpo/streaming`)

## 1. 책임
관심점(카메라·플레이어·예측 위치)에 따라 셀을 **요청 → 다운로드 → 워커 디코드 → 준비(ready) 이벤트 → 해제**한다.
three.js를 모른다. 디코드 결과는 순수 TypedArray 구조(`DecodedMesh` 등)로 내보내고, 렌더/물리/시뮬 어댑터가 소비한다.

## 2. 셀 상태기계
```
absent → queued → fetching → decoding → ready ──(render ack)──► live
   ▲        │          │           │                                       │
   └────────┴──cancel──┴───────────┴────────── evicting ◄──(out of range)──┘
failed (3회 재시도 후) → 부모 HLOD 유지, 60 s 후 재시도 가능
```
- `ready`→`live`: **render의 ack만으로** `live`(시각적 존재 기준). sim/audio/ui는 같은 payload를 받아 각자 `ack(key, consumer)`로 기록만 한다(통계·디버그용).
- **physics는 payload로 콜라이더를 받지 않는다.** 물리 반경(08 §4)에 들어온 `live` 셀에 대해 wiring이 `requestSections(key, ['collision.bin','terrain.height'])`를 호출 → Cache Storage에서 재읽기·해당 섹션만 디코드해 전달. 반경 이탈 시 `physics.removeCell`. (렌더 반경 > 물리 반경이어도 콜라이더 유실 없음)
- 취소: 해제 반경(× 1.25) 밖으로 벗어난 `queued/fetching/decoding` 요청은 `AbortController`로 취소(해제 반경 안이면 계속 받음).
- 해제: 재계산이 만든 계획을 프레임당 최대 8개 실행(순간이동 시 분산). 실행 직전 로드 영역·whenReady 대상이면 건너뜀. onReady 전 해제는 이벤트 없음.
- 재계산(원하는 셀·순위·해제 계획): 관심점 L0 셀·모드·티어 변화 시 즉시, 그 외 250 ms마다(ADR-0023).

## 3. 관심점과 로딩 반경
`InterestPoint`는 `@sanpo/core` 타입(`{ posWF, velWF?, forward?, weight, kind: 'camera'|'player'|'lookahead'|'teleport' }`).
모드(`ModeId`)·품질 티어는 관심점에 없으므로 streaming이 `mode/changed`·`quality/changed` 이벤트로 추적해 계산 입력(`InterestFrame`)에 넣는다.
거리는 모두 **관심점~셀 AABB 수평(XZ) 최단거리**, 고도 = `posWF.y − 지면 높이`(모르면 지면 0 m). 규칙은 관심점마다 적용 후 합집합.
- lookahead = `player.pos + vel * 3 s` (속도 > 5 m/s일 때만) — traversal 모드가 만든다(streaming은 받은 관심점만 쓴다).
- 모드별 L0 반경(R0): 도보 384 m, 자전거 448 m, 차량 640 m, 열차 768 m, transition 384 m, 자유비행: `384 + 0.5 * 고도(m)`. 품질 배율(07 §9) 적용 후 **R0 ≤ 768 m 클램프**.
- 열차 진행 방향 가중(L0만): 수평 속도 > 5 m/s면 셀 거리 × `(1 + 0.5 × max(0, −cosθ))`(θ = 진행 방향 ↔ 셀 최근접점 방향). 뒤쪽 반경 ≈ 512 m.
- 고고도(> 300 m): L0는 관심점 셀 중심 **3×3만 로드**, L1 반경 `R1 = 3 km + 1.0 × (고도 − 300 m)`, **≤ 3.5 km**.
  고도 전환도 × 1.25 히스테리시스: 300–375 m는 L0 유지 = 원형 `R0 × 1.25`(방금 로드한 링 보존), 375 m 초과는 유지 = 5×5.
| 레벨 | 로드 반경 | 해제 반경(히스테리시스) | 최대 상주 |
|---|---|---|---|
| L0 (256 m) | R0 (고고도: 3×3) | R0 × 1.25 (고도 > 375 m: 5×5) | 72 |
| L1 (1 km) | 3 km (고고도: ≤ 3.5 km) | × 1.25 (≤ 4.375 km) | 80 |
| L2 (4 km) | 12 km | 15 km | 64 |
| L3 (16 km) | 전역(`cells.idx`의 L3 전부) | — | 16 |

- `cells.idx`에 없는 셀은 원하는 집합에 넣지 않는다. 해제 반경 안이라도 **상주 중인 셀만 유지**(새로 요청하지 않음).
- 실측 셀 수(한 점, 셀 내 위치 32×32 샘플, 로드 / 해제 반경): 도보 11–16 / 16–22, 자전거 16–21 / 23–28, 차량 27–32 / 42–48,
  열차 39–45 / 57–65(진행 중 + lookahead 90 m: 33–41 / 47–58), L1 3 km 36–43 / 56–61, L1 3.5 km 45–54 / 69–80, L2 36–43 / 56–61.
  한도는 해제 반경 셀 수 이상으로 설정(ADR-0021 — L1 64 → 80은 고고도 확장 때문).
- 한도는 **소프트 리밋**: 초과 시 해제 반경 밖 → 로드 반경 밖 순으로 가장 먼 셀부터 해제. 로드 반경 안 셀은 절대 해제하지 않음(초과 시 warn 로그).

## 4. 우선순위 점수 (낮을수록 먼저, ADR-0021)
```
foot   = level == 0 && cellContains(player | teleport 관심점)          // 발밑 셀 (물리 필수)
d      = min over points(weight > 0) of  dist(point, cell) / weight × (kind == 'teleport' ? 0.05 : 1)
score  = foot ? −1                                                     // 고정 최우선(다른 점수는 모두 ≥ 0)
       : d / levelSize × (inViewWedge ? 0.5 : 1.0)                     // 카메라 forward ±60° 수평 쐐기
score  = max(score, score(parent) + 0.001)  if parent ∈ 같은 요청 후보 && !foot   // 부모 선행(상위 레벨부터 전파)
```
- 결과적으로 부팅·순간이동 순서 = 발밑 셀 → 그 L3 → L2 → L1 → 나머지(거리순). 동률은 셀 키 오름차순(결정론).
- 부모가 이미 요청됐거나 live·failed(후보 아님)면 제약 없음 — failed 부모가 자식을 막지 않는다.
- 동시 fetch 최대 8, 디코드 큐는 워커 수 × 2.
- 대역폭 추정(EMA)과 `cells.idx`의 byteLength로 "3초 내 도착 불가" 요청은 한 레벨 위 HLOD를 먼저 요청.

## 5. HLOD 교체 규칙 (틈/중복 없는 전환)
- L1–L3의 `hlod.mesh`는 **자식 16개 영역별 프리미티브 그룹**(`extras.child = 0..15`)으로 분할 저장한다.
- 렌더러는 자식 셀이 `live`(= render ack)가 되면 부모의 해당 그룹만 숨긴다 → 부분 로딩 중에도 구멍/겹침 없음.
- 전환 시 0.3 s 디더 크로스페이드(TSL `alphaHash` 기반, 투명 정렬 불필요).
- 자식 해제 시 부모 그룹을 먼저 다시 보이게 한 후 자식 제거.

## 6. 적용 예산 (메인 스레드)
- 프레임당 GPU 업로드/오브젝트 생성 ≤ 2 ms (측정 기반 적응: 초과 시 다음 프레임으로 이월).
- 한 프레임에 `onReady` 콜백(+ `cell/ready` 키 이벤트) 최대 2개, 해제(`onEvicted` + `cell/evicted`) 최대 8개.
- 셰이더: 머티리얼 클래스 수가 고정(`07-rendering.md §4`)이므로 부팅 시 `renderer.compileAsync`로 선컴파일 → 스트리밍 중 컴파일 끊김 없음.

## 7. 캐시 계층
1. 브라우저 HTTP 캐시 (`Cache-Control: immutable`, URL에 buildId 포함).
2. Cache Storage `sanpo-world-<buildId>`: 방문한 셀 저장(최대 1.5 GB, LRU — 세션 간 순서는 저장 순서 근사, ADR-0023). 부팅 시 다른 buildId 캐시 삭제(`purgeStaleCaches`, `init()`).
   키 = 셀 URL. 저장은 네트워크 응답의 `Response.clone()`(메인 JS 복사 없음), 적중 시 크기가 cells.idx와 다르면 삭제 후 네트워크.
   워커가 hash32·컨테이너 손상(`mismatch`/`corrupt` 등)을 보고하면 스케줄러가 해당 캐시 항목을 지운다(`Fetcher.invalidate`).
3. 메모리: 디코드 결과는 소비자에게 넘기면 폐기(중복 보관 금지). 재방문·`requestSections`는 2)에서 재읽기·재디코드. Cache Storage 미스(축출) 시 네트워크 재요청.

## 8. 부팅 로딩 순서 (`whenReady`)
1. `world.json`, `cells.idx`, 머티리얼 매니페스트, 필수 shared(프롭 LOD, 나무, 캐릭터 1종).
2. L3 전체 → 스폰 주변 L2 3×3 → L1 3×3.
3. 스폰 L0 3×3 `live` + 발밑·인접 셀 콜라이더가 물리 워커에 적용됨(`physics.hasCell`).
4. 셰이더 선컴파일 완료 → 플레이 시작. 나머지는 백그라운드.
- 순간이동(빠른 이동): 페이드아웃 → `whenReady({ centerWF, radius: 256, levels: [0, 1] })` → 페이드인.

## 9. 공개 API (계약 — `packages/streaming/src/api.ts`)
```ts
export type CellState = 'absent'|'queued'|'fetching'|'decoding'|'ready'|'live'|'evicting'|'failed';
export type ConsumerId = 'render' | 'physics' | 'sim' | 'audio' | 'ui';

// DecodedMesh, CellPayload 등 셀 데이터 모델은 @sanpo/tile-format api.ts에 정의 (정의 전문: docs/modules/tile-format.md "셀 데이터 모델").
export interface StreamingService extends SystemProvider {
  setInterest(points: readonly InterestPoint[]): void;
  ack(key: CellKey, consumer: ConsumerId): void;
  whenReady(req: { centerWF: Vec3d; radius: number; levels: number[] }): Promise<void>;  // 영역 셀 pinned, 전부 live|failed면 resolve
  stateOf(key: CellKey): CellState;
  groundHeightAt(x: number, z: number): number | undefined;   // L0 heightfield 기반, 없으면 undefined
  onReady(cb: (p: CellPayload) => void): Unsubscribe;          // 콜백은 wiring 1곳만 등록(소유권 단일 이전)
  requestSections(key: CellKey, types: SectionType[]): Promise<Partial<CellPayload>>;  // physics용 재디코드
  onEvicted(cb: (key: CellKey) => void): Unsubscribe;
  stats(): StreamingStats;
}
export function createStreaming(deps: {
  bus: EventBus; log: Logger; world: { baseUrl: string; buildId: string; cellsIndex: CellsIndex };
  config?: StreamingConfig; supervisor?: WorkerSupervisor; pool?: DecodePool; fetcher?: Fetcher; clock?: () => number;
}): StreamingService;   // + stats(), dispose(). world.json·cells.idx 로드/검증은 게임 부트(ADR-0023)
```
- `CellPayload`는 워커에서 생성되어 Transferable로 전달된다. 소비자는 배열을 소유권 이전받는다(복사 금지).
- 물리용 `collision`은 `requestSections` 결과를 wiring이 물리 워커로 transfer — 메인에 남기지 않는다.
- `heightfield`는 예외: streaming이 `groundHeightAt`용으로 원본을 보관(셀당 ≈132 KB, L0 최대 72개 ≈ 9.5 MB). 물리 워커용 높이장은 `requestSections(['terrain.height'])`로 별도 디코드된 것을 사용.
- **fetch는 메인(비동기만), 디코드는 워커**(ADR-0022): 메인은 fetch·Cache Storage를 기다린 뒤 바이트를 워커로 transfer만 한다(파싱 없음).
  워커 = hash32 검사(cells.idx) → `readTkc` → 셀·buildId 확인 → 섹션 디코드(glb = 자체 부분집합 파서 + `meshoptimizer/decoder`, gzip = `DecompressionStream`).
  onReady 기본 섹션 = 렌더 메시(`terrain/buildings/roads/decals/overrides/hlod.mesh`) + `terrain.height`. `requestSections`용으로
  `collision.bin`·`lanes.bin`(gunzip된 ArrayBuffer)·`nav.bin`·`meta.json`도 디코드. props/trees/lights/audio는 해당 태스크에서 추가.
- 재시도: 첫 시도 + **3회**(250 → 500 → 1000 ms), 대상 = 네트워크 오류·408·429·5xx·크기 불일치. 404 등 나머지 4xx·취소는 즉시 실패.
  3회 실패 후 `failed` → 60 s 뒤 다시 요청 대상(원하지 않으면 기록 정리). failed는 whenReady를 막지 않는다.
- 워커 풀: 워커 수 = `hardwareConcurrency − 2`(1…4), 워커당 동시 2개(대기열은 풀이 FIFO로 보관). 동시 fetch ≤ 8, 디코드 대기 ≤ 워커 수 × 2일 때만 새 fetch.
- 취소: 셀별 AbortController 하나가 fetch·백오프 대기·디코드를 모두 끊는다. 대기열이면 제거, 워커 안이면 `cancel` 메시지 →
  워커가 다음 단계 경계(섹션·프리미티브, 매크로태스크 양보)에서 중단하고 `cancelled`만 보낸다. 늦게 온 결과는 요청 id로 폐기.
  워커가 죽으면(감독자 재시작) 그 워커의 작업은 `worker` 오류(바이트 소실 → 재요청은 캐시에서).

## 10. 내부 파일 구성 (권장)
```
src/api.ts  src/index.ts
src/internal/cell-index.ts      cells.idx 로더/조회
src/internal/interest.ts        관심점 → 원하는 셀 집합 (레벨별)
src/internal/priority.ts        점수 계산 (순수 함수, 테스트 대상)
src/internal/scheduler.ts       fetch/디코드 큐, 동시성, 취소
src/internal/fetcher.ts         fetch + Cache Storage + 재시도
src/internal/decode-pool.ts     워커 풀(메인): 배분·대기열·취소·늦은 결과 폐기
src/internal/protocol.ts        워커 메시지 판별 유니온
src/internal/decode.worker.ts   워커 엔트리(self ↔ decode-host)
src/internal/decode-host.ts     워커 본체: 요청별 AbortController, 결과 transfer
src/internal/decode.ts, glb.ts  TKC 파싱, gzip, meshopt 디코드 → CellPayload
src/internal/lifecycle.ts       상태기계, ack, eviction
src/internal/ground.ts          heightfield 질의
```
