# 07 — Rendering (`@sanpo/render`)

> 원칙: **물리 기반(선형 HDR, 물리 광량 단위) + 데이터 기반 형상 + 절차적 디테일**. 수작업은 랜드마크에만.
> three r186 addon 이름/옵션은 구현 시 반드시 `node_modules/three/examples/jsm/**`와 `.d.ts`로 확인(CLAUDE.md 규칙 12).

## 1. 렌더러 초기화
```ts
const renderer = new WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: tier === 'webgl-fallback' });
await renderer.init();
renderer.toneMapping = AgXToneMapping;            // 기본. 포토모드에서 Neutral 선택 가능
renderer.outputColorSpace = SRGBColorSpace;
```
- 백엔드 판별: WebGPU 불가 → WebGL2 폴백 자동. 폴백 시 품질 상한 Medium(§9).
- 깊이: 근평면 0.1 m, 원평면 60 km. **reversed-Z**(`reversedDepthBuffer: true` — WebGPU 항상, WebGL2는 `EXT_clip_control` 있을 때), 불가 시 `logarithmicDepthBuffer`. 생성 전 `backend-caps.ts`가 판정(ADR-0006).
- 광량 단위: 태양 조도 lux(맑은 한낮 ≈ 100,000), 가로등 lumen. 노출은 자동 노출(EV100)로 흡수.

## 2. 씬 그래프
```
scene
├─ worldRoot (항상 원점 고정. 자식 노드 위치 = WF − renderOrigin 을 float64로 계산해 float32로 대입)
│  ├─ terrainRoot / roadRoot / buildingRoot / overrideRoot / propRoot / vegetationRoot
│  ├─ dynamicRoot (보행자 인스턴스, 교통 차량, 열차, 플레이어 차량/자전거/아바타)
│  └─ lightRoot (ClusteredLights 등록 광원)
└─ skyRoot (대기·하늘·구름: 카메라 상대)
```
- 셀 노드: `CellRenderNode { group: Group (position = originWF − renderOrigin), meshes, instanceRefs }`.
- 원점 재설정(`origin/rebased`): 모든 셀 노드와 dynamicRoot 자식 위치를 Δ만큼 이동(float64 기준 재계산, 누적 오차 없음).

## 3. 셀 → 메시 변환
- `DecodedMesh` → `BufferGeometry` (TypedArray 그대로 `BufferAttribute`), 머티리얼 클래스별 공유 머티리얼 인스턴스.
- 셀당 드로우콜 목표: L0 ≤ 30, L1 ≤ 8, L2/L3 ≤ 4. HLOD는 머티리얼별 1개(현재 지형·건물 = 2, ADR-0025).
- 소품/나무: 타입별 **전역 InstancedMesh 풀**(셀별이 아님) + 셀별 인스턴스 범위 할당 → 드로우콜 = 타입 수 × LOD 수.
- 컬링: 셀 AABB 프러스텀 컬링(CPU) + 인스턴스는 거리 LOD 선택(CPU, 셀 단위 매 4프레임).

## 4. 머티리얼 클래스 (고정 목록 — 부팅 시 선컴파일)
| ID | 용도 | 핵심 기법 (TSL `*NodeMaterial`) |
|---|---|---|
| `M_TERRAIN` | 지면 | `_SURF` 기반 텍스처 배열 스플랫, 경사 triplanar, 젖음 |
| `M_ROAD` | 차도/보도/연석 | 아스팔트 변형 노이즈(보수 패치·균열·유분), 보도 타일 패턴, 젖음·물웅덩이 |
| `M_DECAL` | 노면 표시 | 도료 마모 마스크, polygonOffset, 약간의 재귀반사 느낌(시선각 스페큘러) |
| `M_FACADE` | 건물 벽 (핵심) | §5 절차적 파사드 |
| `M_ROOF` | 지붕 | 콘크리트/방수시트/금속 변형, 옥상 설비 인스턴스는 별도 |
| `M_GLASS` | 커튼월/대형 유리 | 프레넬 반사(SSR + 환경 프로브), 내부 매핑, 멀리언 패턴 |
| `M_OVERRIDE` | 랜드마크 수작업 | `MeshPhysicalNodeMaterial` 표준 PBR |
| `M_PROP` | 소품 | PBR + 텍스처 배열, 발광 마스크(자판기 등) |
| `M_FOLIAGE` | 잎 | alpha-to-coverage/해시 알파, 투과광, 바람 흔들림, 계절 틴트 |
| `M_IMPOSTOR` | 원거리 나무/소품 | 옥타헤드럴 임포스터 |
| `M_CHARACTER` | 보행자 | VAT(정점 애니메이션 텍스처) + 인스턴스 색 변형 + 소지품(우산) |
| `M_VEHICLE` | 차량 | 클리어코트 도장, 유리, 라이트 발광 |
| `M_WATER` | 강·연못 | 법선 스크롤 + SSR + 빗방울 파문 |
| `M_SIGN` | 간판/전광판 | **가상 브랜드** 텍스트 아틀라스 발광, 밤 점등 |
- 텍스처: `shared/materials`의 KTX2 배열 3장 — albedo 1024² ETC1S(sRGB), normal·ORM 512² UASTC(ADR-0027). 매니페스트(`schemas/materials.schema.json`)가 레이어별 그룹·`tileM`·평균색, 그룹 → 레이어 인덱스를 준다. 셰이더는 그룹(`MATERIAL_GROUPS` 13종) + 해시로 레이어를 고른다. 첫 표시 뒤 지연 적재(그 전엔 평균색), 유리는 절차(텍스처 없음).
- 공통 전역 유니폼(`EnvUniforms`): `wetness`, `snowCover`, `timeOfDay`, `season`, `windDir/strength`, `nightFactor`.

## 5. 절차적 파사드 셰이더 (M_FACADE)
입력: UV0(벽면 미터: u=벽 둘레 방향, v=지면으로부터 높이), `_FACADE`(class, floors, tintIdx, flags), `_BLDG`.
1. **층 분할**: `floorH = classDefaults.floorH` (오피스 3.8 m, 주거 2.9 m, 상업 1층 4.5 m) — `floors`가 있으면 벽 높이/floors로 보정.
2. **베이 분할**: 클래스별 베이 폭(오피스 1.8 m, 맨션 3.0 m, 주택 1.8 m) → 창 SDF 마스크(프레임 두께, 코너 라운드).
3. **벽 재질**: 클래스 + `hash(bldgId)`로 텍스처 배열 레이어 선택(타일, 노출콘크리트, ALC 패널, 금속 패널, 모르타르, 사이딩) × tint.
4. **창**: 유리 반사(환경 프로브 + SSR) + **내부 매핑**(interior mapping: 일본 오피스/주거 실내 큐브맵 8종 배열, 창별 `hash(bldg, floor, bay)` 선택) + 블라인드/커튼 높이 무작위.
5. **야간 점등**: 창별 점등 확률 = f(class, 시각, 요일) — 오피스는 19–22시 감소 곡선, 주거는 18–23시 피크. 점등 창은 실내 매핑 밝기 + 색온도 변화.
6. **1층 상점(flags.retail)**: 셔터(영업시간 외 닫힘), 차양, **가상 간판**(M_SIGN과 같은 아틀라스), 쇼윈도 광원(lights.bin과 연동).
7. **맨션 발코니**: 노멀+시차(POM)로 표현(M05-T07), 필요 시 파이프라인에서 슬래브 지오메트리 압출(ADR).
8. **디테일**: 층간 줄눈, 배수관·실외기(데칼 마스크), 빗물 얼룩(상단→하단 그라디언트 노이즈), AO 모서리 어둡힘.

## 6. 조명·대기
| 요소 | 구현 |
|---|---|
| 태양/달 | three `SunLight` addon (CSM 캐스케이드 그림자). High: 4 캐스케이드×2048², 그림자 거리 600 m. 방향은 **sim이 계산**(suncalc + 수렴각 보정)해 `EnvironmentState.sunDirWF`로 전달, render는 소비만 |
| 하늘/대기 | `@takram/three-atmosphere/webgpu` 0.19.1(+ r186 호환 패치) — `AtmosphereContext`(WF→ECEF: 원점 위치·NUE·수렴각 γ·지오이드 36.7 m) + `AtmosphereLight`(직사·하늘 간접) + `skyBackground()` + 후처리 `aerialPerspective`(ADR-0028) |
| 환경 조명 | `SkyEnvironmentNode`(하늘 64² 큐브 → PMREM) = `scene.environmentNode`, 라이트 간접 끔. 갱신 = 카메라 1 km 이동 또는 태양 각도 변화(라이브러리 임계값, 분할 렌더 안 함 — ADR-0028) |
| 간접광 | `SSGINode`(High+), `GTAONode`(Medium+). 플레이어 주변 `LightProbeGrid`는 M09-T03에서 효용 평가 후 채택 |
| 야간 광원 | `ClusteredLightsNode` — 반경 300 m 내 최대 1024개(가로등 4000 K LED, 편의점풍 5500 K, 주거 2700 K). 원거리는 발광 스프라이트 + 블룸 |
| 신호/차량등 | 발광 머티리얼 + 근거리만 실제 광원 |
| 안개 | 고도 감쇠 높이 안개 + 대기 공중원근 강도(습도·비와 연동) |

## 7. 후처리 파이프라인 (`RenderPipeline`, r183+ 명칭)
```
scenePass(MRT: color, normal, depth, velocity, metalRough)
 → GTAO → SSGI → SSR → 대기 공중원근/높이안개 합성 → 볼류메트릭 구름 합성(Ultra)
 → 비·눈 입자(별도 패스, 깊이 테스트) → Bloom → 자동노출(휘도 히스토그램 EMA)
 → TRAA 또는 TAAU(렌더 스케일 < 1) → 톤매핑(AgX) → LUT 그레이딩(시간·날씨별 3D LUT)
 → Sharpen → 비네팅/필름그레인(약하게) → 출력
```
- 순서의 정확한 조합(TAA 위치, 톤매핑 노드 위치)은 three r186 예제(`webgpu_postprocessing_*`)를 따라 M03-T07에서 확정하고 여기 갱신.
- 포토모드: `DepthOfFieldNode`, 렌더 스케일 1.5×(SSAA), 모션블러 옵션, LUT 선택, 노출/화이트밸런스 수동.

## 8. 날씨·계절 표현
| 상태 | 렌더링 |
|---|---|
| 비 | `wetness` 0→1 (5분 게임시간), 수평면(normal.y>0.95) 물웅덩이 노이즈 마스크 + 파문 노멀, 거칠기↓, 빗줄기 입자(WebGPU compute, 카메라 40 m 원통), 차량 헤드라이트 반사 강조 |
| 흐림/안개 | 태양 조도 감쇠, 하늘 산란 파라미터, 안개 밀도 |
| 눈(희귀) | `snowCover` 상향면 블렌드, 입자 |
| 구름 | Ultra: TSL 레이마치 볼류메트릭(1/4 해상도 + 시간 재투영). High/Medium: 2D 레이어 구름(조명 반영). Low: 하늘만 |
| 계절 | 나무 틴트 테이블: 은행나무 황엽 11/15–12/10, 벚꽃 3/25–4/8, 느티나무 갈색 11월, 겨울 낙엽수 가지만. 보행자 옷 팔레트(겨울 코트, 여름 반팔) |

## 9. 품질 티어
| 항목 | Low | Medium | High | Ultra |
|---|---|---|---|---|
| 렌더 스케일(TAAU) | 0.6 | 0.75 | 0.85 | 1.0 |
| 그림자 | 2×1024, 150 m | 3×1536, 300 m | 4×2048, 600 m | 4×4096, 800 m |
| AO / GI / SSR | – / – / – | GTAO / – / – | GTAO / SSGI(½) / SSR | GTAO / SSGI / SSR |
| 클러스터 광원 | 64 | 256 | 1024 | 2048 |
| 구름 | 하늘만 | 2D | 2D | 볼류메트릭 |
| 보행자(VAT 근거리/총) | 60/200 | 120/500 | 250/1000 | 400/2000 |
| L0 반경 배율 | 0.75 | 1.0 | 1.0 | 1.25 |
- 초기 티어: `detect-gpu` 결과 + 60프레임 측정. 실행 중 **동적 해상도**: 목표 프레임 16.6 ms 유지 위해 렌더 스케일 ±0.05(범위 0.5–1.0).
- WebGL2 폴백: 최대 Medium, compute 입자 → CPU 입자(개수 1/4), 클러스터 광원은 백엔드 지원 여부 확인 후 미지원 시 64개 고정 포워드.

## 10. 렌더 예산 (High, 1440p, 스크램블 교차로 한낮)
| 항목 | 예산 |
|---|---|
| GPU 프레임 | ≤ 12 ms (RTX 3060 기준) |
| 드로우콜 | ≤ 1500 |
| 가시 삼각형 | ≤ 8 M |
| 텍스처 메모리 | ≤ 1.2 GB (압축) |
| 지오메트리 메모리 | ≤ 800 MB |

## 11. 공개 API (`packages/render/src/api.ts`)
```ts
// EnvironmentState, SharedInstanceBuffer, QualityTier 등 공유 타입은 @sanpo/core. CellPayload는 @sanpo/tile-format.
export interface InstanceLayer { readonly capacity: number;
  bindShared(buf: SharedInstanceBuffer): void;   // wiring이 1회 연결. 매 프레임 render가 seq 변화 시 GPU 버퍼 갱신
}
export interface RenderService extends SystemProvider {
  readonly renderOriginWF: Readonly<Vec3d>;
  addCell(p: CellPayload): void;              // 소유권 이전
  removeCell(key: CellKey): void;
  setHlodChildVisible(parent: CellKey, child: number, visible: boolean): void;
  setCamera(c: CameraState): void;            // WF float64, fov, near
  setEnvironment(e: EnvironmentState): void;
  setQuality(t: QualityTier): void;
  layers: { pedestrians: InstanceLayer; traffic: InstanceLayer; trains: InstanceLayer /* 차량(칸) 단위, variant=노선, flags=문 개폐 */; player: PlayerRenderLayer };
  precompile(): Promise<void>;
  screenshot(o: { scale: number; format: 'png' }): Promise<Blob>;
  stats(): RenderStats;
}
export function createRender(deps: { canvas: HTMLCanvasElement; bus: EventBus; log: Logger; assets: SharedAssetLoader; config: RenderConfig }): Promise<RenderService>;
```

## 12. 내부 파일 구성 (권장)
```
src/internal/renderer/        init.ts, backend-caps.ts, dynamic-resolution.ts, quality.ts
src/internal/scene/           scene-graph.ts, cell-node.ts, origin.ts, culling.ts, hlod-switch.ts
src/internal/materials/       registry.ts, terrain.ts, road.ts, decal.ts, facade/*.ts, glass.ts, foliage.ts, character-vat.ts, vehicle.ts, water.ts, sign.ts
src/internal/lighting/        sun.ts, atmosphere.ts, env-probe.ts, clustered.ts, night-lights.ts
src/internal/post/            pipeline.ts, exposure.ts, lut.ts, photo.ts
src/internal/weather/         rain-compute.ts, wetness.ts, clouds-volumetric.ts, clouds-layer.ts
src/internal/instances/       pools.ts, lod.ts, impostor.ts
src/internal/debug/           overlay.ts (동적 import)
```
