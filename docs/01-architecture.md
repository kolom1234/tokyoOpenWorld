# 01 — Architecture

## 1. 시스템 개요
```
[오프라인]                                   [Cloudflare]                    [브라우저]
원천 데이터 ──► tools/pipeline ──► data/build/<buildId>/ ──publish──► R2: world/<buildId>/**  ─┐
(PLATEAU,GSI,OSM,N02,ODPT,CC0에셋)   (정규화→셀 빌드→HLOD)                                      │ fetch (Range 가능)
                                                            apps/worker (Workers + Static Assets)│
                                                              ├ /            → 게임 번들       ◄─┘
                                                              ├ /world/*     → R2 (+Cache API)
                                                              └ /api/*       → 날씨 프록시, 현재 buildId
브라우저: apps/game (메인 스레드) + physics.worker + sim.worker + decode.worker×N
```

## 2. 런타임 스레드 모델
| 스레드 | 책임 | 주기 | 통신 |
|---|---|---|---|
| Main | 입력, 이동 모드 로직, 스트리밍 스케줄링, 렌더 제출, UI | rAF (가변) | — |
| `physics.worker` | Jolt 월드, 캐릭터/차량/자전거, 레이캐스트 | 고정 120 Hz | 명령: 메시지 배치 / 상태: SAB 더블버퍼 |
| `sim.worker` | 군중(DetourCrowd), 교통(IDM), 열차 운행 | 고정 30 Hz | 인스턴스 트랜스폼 SAB, 이벤트 메시지 |
| `decode.worker` ×N | TKC 파싱, meshopt 디코드, 콜라이더/내비 준비 | 요청 기반 | Transferable ArrayBuffer |
| KTX2 트랜스코더 | three `KTX2Loader` 자체 워커 풀 | 요청 기반 | three 내부 |
| AudioWorklet (선택) | 엔진음 합성 | 오디오 레이트 | MessagePort |

- `crossOriginIsolated === true` 필요(SAB, Jolt 멀티스레드). Worker가 COOP/COEP 헤더 제공 (`13-deployment.md §3`).
- 격리 실패 시 폴백 모드 `IsolationMode.Degraded`: SAB 대신 postMessage + Transferable, Jolt 싱글스레드 빌드.
- N = `clamp(navigator.hardwareConcurrency - 3, 1, 4)`.

## 3. 저장소 구조 (상세)
```
tokyo-sanpo/
├─ CLAUDE.md  PROGRESS.md  README.md
├─ docs/ (00~17, modules/, adr/, generated/CODEMAP.md)
├─ schemas/              JSON Schema (world.json, cell-header, meta, areas, attribution)
├─ apps/
│  ├─ game/
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ main.ts            엔트리: 기능 감지 → boot
│  │     ├─ boot.ts            Composition Root: 서비스 생성·연결 (유일한 "배선" 장소)
│  │     ├─ wiring/*.ts        패키지 간 어댑터 (streaming→render/physics/sim 연결)
│  │     ├─ loop.ts            프레임 스케줄러 실행
│  │     └─ workers/*.worker.ts  각 패키지 워커 엔트리를 re-export
│  └─ worker/
│     ├─ wrangler.jsonc
│     └─ src/{index.ts, routes/*.ts, headers.ts, cache.ts, validate.ts}
├─ packages/<pkg>/
│  ├─ package.json  (name: @sanpo/<pkg>, exports: "./src/index.ts")
│  ├─ src/index.ts   공개 export만 (api.ts 재수출 + create* 팩토리)
│  ├─ src/api.ts     공개 타입·인터페이스 (계약)
│  ├─ src/internal/**  구현 (외부 import 금지)
│  └─ test/**
├─ tools/
│  ├─ pipeline/src/{cli.ts, stages/*, lib/*}
│  └─ codemap/src/index.ts
├─ content/
│  ├─ materials/*.json         머티리얼 정의 (텍스처 소스·파라미터)
│  ├─ sim/*.yaml|json          시뮬 파라미터(신호 계획, 핫스팟, 기후, 계절, 합성 시간표, 공휴일)
│  ├─ vehicles/*.json          차량 물리 스펙 (+ trains/, characters/ 모델 원본)
│  ├─ signage/brands.yaml      가상 브랜드 사전
│  ├─ overrides/<gmlId>/       랜드마크 수작업 모델(.blend 원본 + export .glb)
│  ├─ props/                   소품 원본 (.glb, CC0 출처 기록)
│  ├─ audio/                   사운드 원본 (CC0/자체제작)
│  ├─ poi/*.yaml               POI 설명(자체 작성 텍스트, ko/ja/en)
│  └─ ATTRIBUTION.json         모든 외부 소스의 라이선스·출처 (schemas/attribution.schema.json)
├─ data/                       (git 제외) raw/ normalized/ build/ + sources.lock.json(커밋함) + areas/*.json(커밋함)
└─ .claude/ (settings.json, commands/)
```

## 4. 패키지 레이어와 의존 규칙
하위 레이어만 import 가능. 같은 레이어 간 import 금지(예외 명시). `dependency-cruiser` 규칙으로 강제.

| 레이어 | 패키지 | 허용 의존 |
|---|---|---|
| L0 | `core` | (없음, three 금지) |
| L1 | `geo`, `tile-format` | core |
| L2 | `input`, `streaming`, `physics`, `audio` | core, geo, tile-format |
| L3 | `render`, `sim` | core, geo, tile-format, (three) |
| L3 | `traversal` | core, geo, input, physics (예외: L2 `physics`/`input`의 api만) |
| L4 | `ui` | core (게임 상태는 `UiBridge` 인터페이스로 주입받음) |
| L5 | `apps/game` | 전부 |
| — | `apps/worker` | core, tile-format(타입만) |
| — | `tools/pipeline` | core, geo, tile-format (three는 헤드리스 유틸 용도만 허용) |

핵심: **streaming은 render/physics/sim을 모른다.** `CellPayload`를 `onReady` 콜백으로 내보내고, `apps/game/src/wiring/`가 각 소비자에 전달한다.

**공유 계약 타입의 위치(레이어 위반 방지)**:
| 타입 | 소속 | 이유 |
|---|---|---|
| `Vec3d, Quat, CellKey, CellId, Unsubscribe, FrameContext, CameraState, PlayerState, InterestPoint, ModeId, QualityTier, WeatherParams, SeasonParams, EnvironmentState, SharedInstanceBuffer, GroundQuery, I18nKey, TrainInfo` | `@sanpo/core` | 여러 레이어가 공유하는 어휘 |
| `CellPayload, DecodedMesh, HeightfieldData, PropBatch, TreeBatch, LightRecord, AudioZones, CellMeta, CellHeader, InteractableRecord` | `@sanpo/tile-format` | 셀 데이터 모델(디코드 결과 포함) |
| 서비스 인터페이스(`RenderService` 등) | 각 패키지 `api.ts` | 구현 소유자 |
- sim은 render의 `InstanceLayer`를 받지 않는다: sim은 `SharedInstanceBuffer`를 노출하고, wiring이 부트 시 1회 `render.layers.*.bindShared(buf)`로 연결한다.

## 5. 프레임 루프 (메인 스레드)
`@sanpo/core`의 `Scheduler`가 `phase` 오름차순으로 `update(frame)` 호출.
| phase | 시스템 | 작업 |
|---|---|---|
| 0 | input | 디바이스 폴링 → `ActionState` |
| 10 | clock | 게임 시각 진행 (`WorldClock`) |
| 20 | traversal | 활성 모드가 의도(intent) 계산 → 물리 명령 enqueue, 카메라 목표 |
| 30 | physicsSync | 명령 배치 전송, 최신 스냅샷 보간 읽기 |
| 35 | traversalPost | 보간된 플레이어 포즈로 카메라 리그 확정 |
| 40 | simSync | sim 워커 스냅샷(보행자/차량/열차) 수신, 플레이어 위치 전달 |
| 50 | streaming | 관심점(카메라/플레이어/속도) → 요청/해제, 준비된 셀 적용(예산 내) |
| 60 | audio | 리스너 갱신, 존 크로스페이드 |
| 70 | renderPrep | 대기/태양 갱신, 인스턴스 버퍼 업로드, 원점 재설정 |
| 80 | render | `renderer.renderAsync` (RenderPipeline) |
| 90 | ui | HUD 시그널 갱신 (10 Hz 스로틀) |

```ts
// packages/core/src/api.ts (발췌)
export interface FrameContext {
  frameIndex: number;
  dtReal: number;          // s, clamp [0, 0.1]
  dtGame: number;          // s, timeScale 반영
  gameTimeMs: number;      // Unix ms (JST 표시는 UI에서)
  camera: Readonly<CameraState>;   // WF float64
  player: Readonly<PlayerState>;
}
export interface GameSystem {
  readonly id: string;
  readonly phase: number;
  init?(): Promise<void>;
  update(frame: FrameContext): void;
  dispose(): void;
}
/** 서비스는 하나 이상의 GameSystem(phase가 다를 수 있음)을 제공한다. 예: render → [renderPrep(70), render(80)] */
export interface SystemProvider { systems(): readonly GameSystem[]; }
/** Scheduler가 FrameContext를 채우는 출처. apps/game이 등록한다. */
export interface FrameSource { camera(): CameraState; player(): PlayerState; gameTimeMs(): number; timeScale(): number; }
```
- `Scheduler.setFrameSource(src)`를 부트 시 1회 호출. `dtGame = dtReal × timeScale()`.

## 6. 이벤트 버스 (`@sanpo/core` TypedEventBus)
동기 dispatch, 핸들러 예외는 로깅 후 격리. 이벤트 목록은 `packages/core/src/events.ts` 단일 파일에서만 정의.
| 이벤트 | payload | 발행 |
|---|---|---|
| `cell/ready` | `{ key: CellKey }` (키만. payload는 `streaming.onReady` 콜백으로 **단 한 번** 소유권 이전) | streaming |
| `cell/evicted` | `{ key: CellKey }` | streaming |
| `origin/rebased` | `{ oldOrigin: Vec3d, newOrigin: Vec3d }` | render |
| `mode/changed` | `{ from: ModeId, to: ModeId }` | traversal |
| `poi/discovered` | `{ poiId: string }` | sim(poi) |
| `time/jumped` | `{ gameTimeMs }` | clock |
| `weather/changed` | `{ params: WeatherParams }` | sim(weather) |
| `quality/changed` | `{ tier: QualityTier }` | ui/settings |

## 7. 좌표계 (가장 중요한 불변식)
| 이름 | 정의 | 사용처 |
|---|---|---|
| GEO | EPSG:6668 (JGD2011 위경도) + 높이 T.P.(도쿄만 평균해면) | 원천 데이터, UI 표기 |
| PLATEAU 원본 | EPSG:6697 (JGD2011 위경도 + T.P. 높이), 축순서 lat, lon | CityGML 입력 |
| PRJ | EPSG:6677 (평면직각좌표계 IX계). **축: X=북(Northing), Y=동(Easting)** | 파이프라인 중간 |
| **WF** | `x = E − E0`, `y = H(T.P.)`, `z = −(N − N0)`; 단위 m; 오른손, Y-up, **−Z = 도북(grid north)** | 게임 전체 |
| RENDER | `WF − renderOrigin` (float32) | three.js 씬 |
| PHYS | `WF − physicsAnchor` (float32) | Jolt |

- 원점: `E0 = −12000.0`, `N0 = −37760.0` (EPSG:6677). 스크램블 교차로 ≈ WF(−22.3, 0, 8.6). `data/world.json`에 고정 기록, 변경 금지(변경 시 전체 리빌드 + ADR).
- 참고 좌표(WF x, z): 신주쿠역 (9, −3339), 하라주쿠역 (196, −1187), 도청 (−797, −3341).
- 도북/진북 차: 이 지역 자오선 수렴각 ≈ 0.08°. 태양 방위 계산 시 `geo.trueToGridAzimuthDeg(az, ll)`(`gridConvergenceDeg`)로 보정 — sim이 계산해 `EnvironmentState.sunDirWF`로 전달.
- 축척계수(≈0.9999) 오차 0.01%는 무시(문서화된 허용 오차).
- 저장 규칙: 게임 상태의 위치는 모두 `Vec3d`(float64, WF). float32 변환은 render/physics 경계에서만.
- **렌더 원점 재설정**: 카메라가 `renderOrigin`에서 2048 m 이상 멀어지면 256 m 격자에 스냅해 재설정, `origin/rebased` 발행.
- **물리 앵커**: 세션 시작 시 플레이어 위치의 1024 m 격자점. 플레이어가 4096 m 이상 멀어지면 모든 바디를 −Δ 이동(1프레임 일시정지 허용, 08-physics §2).

## 8. 셀(타일) 인덱싱
- L0 셀 크기 256 m. `ix = floor(x / 256)`, `iz = floor(z / 256)` (WF 기준, 음수 허용).
- HLOD 레벨: L1 = 1024 m (L0 4×4), L2 = 4096 m, L3 = 16384 m. 부모 인덱스 = `floor(i / 4)`.
- `CellId` 문자열: `"L{level}_{ix}_{iz}"` (예: `L0_-1_0`). 숫자 키: `packCellKey(level, ix, iz)` → 53-bit 정수 (core/geo 제공).

## 9. 에러 처리 & 관측
- 네트워크/디코드 실패: 3회 지수 백오프 재시도 → 실패 셀은 부모 HLOD로 대체 표시, `Logger.warn`.
- 워커 크래시: `WorkerSupervisor`가 재시작, 물리 워커 재시작 시 현재 로드된 셀의 콜라이더 재전송.
- 디버그 오버레이(`?debug=1`): FPS, draw calls, 삼각형, GPU 메모리 추정, 셀 상태 맵, 워커 큐 길이 (stats-gl + lil-gui).
- 원격 오류 보고: Worker `/api/log` (샘플링 1%, PII 없음) — M11.

## 10. 확장 원칙
- 새 이동수단/시스템 = 새 `GameSystem` + `ModeId` 추가, 기존 코드 수정 최소화 (개방-폐쇄).
- 새 셀 레이어 = TKC 섹션 타입 추가 (`05-tile-format.md §4` 레지스트리) + 소비자 어댑터 추가.
- 새 구역 = `data/areas/<name>.json` 추가 후 파이프라인 재실행.
