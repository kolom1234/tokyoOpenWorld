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
- 취소: 관심 범위 밖으로 벗어난 `queued/fetching` 요청은 `AbortController`로 취소.

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
- 한 프레임에 `onReady` 콜백(+ `cell/ready` 키 이벤트) 최대 2개.
- 셰이더: 머티리얼 클래스 수가 고정(`07-rendering.md §4`)이므로 부팅 시 `renderer.compileAsync`로 선컴파일 → 스트리밍 중 컴파일 끊김 없음.

## 7. 캐시 계층
1. 브라우저 HTTP 캐시 (`Cache-Control: immutable`, URL에 buildId 포함).
2. Cache Storage `sanpo-world-<buildId>`: 방문한 셀 저장(최대 1.5 GB, LRU). 부팅 시 다른 buildId 캐시 삭제.
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
  whenReady(req: { centerWF: Vec3d; radius: number; levels: number[] }): Promise<void>;
  stateOf(key: CellKey): CellState;
  groundHeightAt(x: number, z: number): number | undefined;   // L0 heightfield 기반, 없으면 undefined
  onReady(cb: (p: CellPayload) => void): Unsubscribe;          // 콜백은 wiring 1곳만 등록(소유권 단일 이전)
  requestSections(key: CellKey, types: SectionType[]): Promise<Partial<CellPayload>>;  // physics용 재디코드
  onEvicted(cb: (key: CellKey) => void): Unsubscribe;
  stats(): StreamingStats;
}
export function createStreaming(deps: { bus: EventBus; log: Logger; config: StreamingConfig; fetcher?: Fetcher }): StreamingService;
```
- `CellPayload`는 워커에서 생성되어 Transferable로 전달된다. 소비자는 배열을 소유권 이전받는다(복사 금지).
- 물리용 `collision`은 `requestSections` 결과를 wiring이 물리 워커로 transfer — 메인에 남기지 않는다.
- `heightfield`는 예외: streaming이 `groundHeightAt`용으로 원본을 보관(셀당 ≈132 KB, L0 최대 72개 ≈ 9.5 MB). 물리 워커용 높이장은 `requestSections(['terrain.height'])`로 별도 디코드된 것을 사용.

## 10. 내부 파일 구성 (권장)
```
src/api.ts  src/index.ts
src/internal/cell-index.ts      cells.idx 로더/조회
src/internal/interest.ts        관심점 → 원하는 셀 집합 (레벨별)
src/internal/priority.ts        점수 계산 (순수 함수, 테스트 대상)
src/internal/scheduler.ts       fetch/디코드 큐, 동시성, 취소
src/internal/fetcher.ts         fetch + Cache Storage + 재시도
src/internal/decode.worker.ts   TKC 파싱, gzip, meshopt 디코드 → CellPayload
src/internal/lifecycle.ts       상태기계, ack, eviction
src/internal/ground.ts          heightfield 질의
```
