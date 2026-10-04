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
  구현(M05-T03, ADR-0051) `props/{geo,models,blocks,pools}.ts`: 코드 절차 모델(정점색, LOD 0/1/2), **LOD당 풀 1개**(전 종류 합친 기하 + 인스턴스 종류 번호 — three r186은 InstancedMesh마다 노드 빌드 ≈ 140 ms라 종류 × LOD 풀 대신), 64 m 블록 거리 LOD(0 ≤ 40·1 ≤ 150·2 ≤ 종류별 80–600 m, 히스테리시스 2 m, 카메라 1 m 이동마다), 바뀐 LOD만 재작성.
- 컬링: 셀 AABB 프러스텀 컬링(CPU) + 인스턴스는 거리 LOD 선택(CPU, 셀 단위 매 4프레임).

## 4. 머티리얼 클래스 (고정 목록 — 부팅 시 선컴파일)
| ID | 용도 | 핵심 기법 (TSL `*NodeMaterial`) |
|---|---|---|
| `M_TERRAIN` | 지면 | `_SURF` 기반 텍스처 배열 스플랫, 경사 triplanar, 젖음 |
| `M_ROAD` | 차도/보도/연석 | 아스팔트 변형 노이즈(보수 패치·균열·유분), 보도 타일 패턴, 젖음·물웅덩이 |
| `M_DECAL` | 노면 표시 | 도료 마모 마스크, polygonOffset, 약간의 재귀반사 느낌(시선각 스페큘러). **구현(M05-T02, ADR-0050)** `materials/decal.ts` `road_marking`: `_PAINT` 흰·황, 노이즈 3축척 마모 = 알파 테스트, 지형 위 2 cm 기하 오프셋(깊이 편향 없음), 재귀반사 미구현 |
| `M_FACADE` | 건물 벽 (핵심) | §5 절차적 파사드 |
| `M_ROOF` | 지붕 | 콘크리트/방수시트/금속 변형, 옥상 설비 인스턴스는 별도 |
| `M_GLASS` | 커튼월/대형 유리 | 프레넬 반사(SSR + 환경 프로브), 내부 매핑, 멀리언 패턴 — 셰이딩 함수 `materials/glass.ts`(파사드 창·커튼월·상점 유리 공유, M03-T05) |
| `M_OVERRIDE` | 랜드마크 | **구현(M05-T05, ADR-0053)** `materials/landmark.ts` `landmark`: Standard PBR, `_LMAT` 15종 표(색·거칠기·금속도) + 절차 무늬(멀리언·흰 세로 핀·석재 줄눈·화강암 창 격자·강판 이음·자갈·나뭇결·청동 녹, fwidth 거리 평균) + 화면 가상 영상(색면·원·띠·LED 격자, 글자·로고 없음, `screenExposure`) |
| `M_PROP` | 소품 | PBR + 텍스처 배열, 발광 마스크(자판기 등). **구현(M05-T03)** `materials/prop.ts` `street_prop` = 정점색 × 인스턴스 색(자판기 가상 브랜드), 텍스처·발광 없음(야간 = M09-T03). 전선 `power_wire` = 중심선 + `_OFF` 거리 비례 최소 폭(≈ 1.5 px) |
| `M_FOLIAGE` | 잎 | alpha-to-coverage/해시 알파, 투과광, 바람 흔들림, 계절 틴트. **구현(M05-T04, ADR-0052)** `trees/materials.ts` `tree_leaf`: 자체 잎 아틀라스 알파 테스트, Lambert + 태양 + 하늘 간접광(보조 AtmosphereLight) + 투과 22 %, 높이² 흔들림·떨림, 수종 계절 표. 인스턴싱 = InstancedBufferGeometry 속성(`_ipos`·`_iext`) |
| `M_IMPOSTOR` | 원거리 나무/소품 | 옥타헤드럴 임포스터. **구현(M05-T04)** `tree_impostor`: 반팔면체 8 × 8 틀(CPU 굽기), 나무 로컬 방향으로 틀 선택, 구면 법선, 수종 타일 3 × 2 |
| `M_CHARACTER` | 보행자 | ~~VAT~~ → **뼈 팔레트 텍스처 스키닝**(ADR-0057·0061: Rocketbox 리그 23뼈, 4영향 × 사원수+이동 RGBA16F, `crowd/material.ts`) + 아틀라스 배열 층·밝기·키 변형, 소지품은 T04 |
| `M_VEHICLE` | 차량 | 클리어코트 도장, 유리, 라이트 발광 |
| `M_WATER` | 강·연못 | 법선 스크롤 + SSR + 빗방울 파문 |
| `M_SIGN` | 간판/전광판 | **가상 브랜드** 텍스트 아틀라스 발광, 밤 점등. **구현(M05-T06, ADR-0054)** `signs/{atlas,material,field,models}.ts` `sign`: 색까지 구운 sRGB 아틀라스(가로 4:1·세로 1:4 타일) 표본 1회, 돌출 상자·입간판·옥상 광고탑 풀(InstancedBufferGeometry `_ipos`·`_isig`, 브랜드 = WF 위치 해시). 발광·점등은 M09 |
- 텍스처: `shared/materials`의 KTX2 배열 3장 — albedo 1024² ETC1S(sRGB), normal·ORM 512² UASTC(ADR-0027). 매니페스트(`schemas/materials.schema.json`)가 레이어별 그룹·`tileM`·평균색, 그룹 → 레이어 인덱스를 준다. 셰이더는 그룹(`MATERIAL_GROUPS` 13종) + 해시로 레이어를 고른다. 첫 표시 뒤 지연 적재(그 전엔 평균색), 유리는 절차(텍스처 없음).
- 공통 전역 유니폼(`EnvUniforms`): `wetness`, `snowCover`, `timeOfDay`, `season`, `windDir/strength`, `nightFactor`. 구현(M03-T06) = `weather/wetness.ts`의 `wetness`(값 = `EnvironmentState.weather.wetness`, sim 날씨 M06 전엔 0·디버그 `?wet=`), 나머지는 쓰는 태스크에서 추가.
- **M_TERRAIN 구현(M03-T06, ADR-0031)** `materials/{terrain,road,noise}.ts`: 정점 `_SURF` 원-핫(8) 보간 → 픽셀마다 상위 2클래스, 클래스 순서에 반대칭인 노이즈로 경계 혼합(±0.08). 주 클래스 = 위 투영 2표본(두 번째 = 0.83 rad 회전·0.61배 축척, ≈ 6 m 노이즈 가중, **분산 보존 혼합** m + (mix − m)/√(w²+(1−w)²)), 법선은 첫 표본만. 보조 클래스 = 알베도·ORM 1표본. 경사 triplanar(측면 투영 알베도)는 `TerrainOptions.triplanar`(기본 끔, +0.7–1.3 ms — 품질 티어 T08). 노이즈 = 256² RGBA 격자값 텍스처 `noiseBank`(4축척 × 4채널, 4표본 — ALU 해시는 7–9 ms였다). 이어서 M_ROAD 변형(아스팔트 보수 패치·유분·바랜 구간, 보도 구간 명암·때 — 추가 표본 없음), 29 m 거시 명암, 젖음(흡수율별 알베도 ↓ 최대 55 %, 수막 거칠기 ↓, n.y > 0.97 포장면 물웅덩이 — 젖음 0.35부터). 1440p 지형 순증 ≈ +1.2–1.8 ms(RTX 3050 Laptop). 도로 전용 메시·연석·차선(`M_ROAD`·`M_DECAL` 별도 메시)은 M05-T01. 파문 노멀은 M06.

## 5. 절차적 파사드 셰이더 (M_FACADE)
입력: UV0(벽면 미터: u=같은 평면 묶음 시작점부터, v=건물 최저점부터), UV1(면 폭, 건물 높이), `_FACADE`(class, floors, tintIdx, flags) — 면 상수는 **flat varying**. 구현 `materials/facade/{grid,walls,windows,retail,details,index}.ts`(ADR-0030, M03-T04). 1–3·6·8 구현, 4(유리·실내)는 T05, 5(야간)는 M09, 7(발코니)은 M05-T07.
1. **층 분할**: `floorH = classDefaults.floorH` (오피스 3.8 m, 주거 2.9 m, 상업 1층 4.5 m) — `floors`가 있으면 벽 높이/floors로 보정.
2. **베이 분할**: 클래스별 베이 폭(오피스 1.8 m, 맨션 3.0 m, 주택 1.8 m) → 창 SDF 마스크(프레임 두께, 코너 라운드).
3. **벽 재질**: 클래스 + `hash(bldgId)`로 텍스처 배열 레이어 선택(타일, 노출콘크리트, ALC 패널, 금속 패널, 모르타르, 사이딩) × tint.
4. **창**: 유리 반사(환경 프로브 + SSR) + **내부 매핑**(interior mapping: 일본 오피스/주거 실내 큐브맵 8종 배열, 창별 `hash(bldg, floor, bay)` 선택) + 블라인드/커튼 높이 무작위.
   구현(M03-T05, ADR-0034): 방 = 베이 × 층 × 깊이(사무 7 m·주거 4.5 m), 시선 광선-상자 교차 → 교차점 방향으로 큐브맵 조회. 큐브맵은 파이프라인이
   방 중심에서 광선 추적한 **자체 제작**(`materials/interiors.ts`, 256² × 6면 × 8방 = 2D 배열 48레이어 ETC1S 0.14 MB, manifest `interiors`).
   셰이더 `facade/interior.ts`(유리 픽셀에서만 동적 분기, 명시 LOD, 베이 < ≈ 3 px면 방 평균색) + `glass.ts`(실내 = 발광 × (1 − 프레넬) × 투과율 0.8/커튼월 0.35 ×
   `interiorExposure` 0.02, 블라인드 = 유리 안쪽 확산 알베도·살 무늬). 방 선택: 사무(열린 사무실 45 %·회의 20 %·소등 25 %·창고 10 %), 주거 4종 균등, 좌우 반전 50 %.
5. **야간 점등**: 창별 점등 확률 = f(class, 시각, 요일) — 오피스는 19–22시 감소 곡선, 주거는 18–23시 피크. 점등 창은 실내 매핑 밝기 + 색온도 변화.
6. **1층 상점(flags.retail)**: 셔터(영업시간 외 닫힘), 차양, **가상 간판**(M_SIGN과 같은 아틀라스 — M05-T06: 간판 띠 베이 가운데 4:1 타일 + 나머지 = 브랜드 바탕색), 쇼윈도 광원(lights.bin과 연동). 창문 시트는 ⚠️ 미구현.
7. **맨션 발코니**: 노멀+시차(POM)로 표현(M05-T07), 필요 시 파이프라인에서 슬래브 지오메트리 압출(ADR). **구현(ADR-0055)** `facade/balcony.ts`: 난간판·슬래브 끝·칸막이 + 안쪽 깊이 1.2 m 시차 격자(gIn) + 천장 그늘, 기하 없음. 평지붕 방수 마감 색(walls.ts). 옥상 설비·외부 비상계단은 파이프라인 기하(overrides.mesh).
8. **디테일**: 층간 줄눈, 배수관·실외기(데칼 마스크), 빗물 얼룩(상단→하단 그라디언트 노이즈), AO 모서리 어둡힘.

## 6. 조명·대기
| 요소 | 구현 |
|---|---|
| 태양/달 | takram `AtmosphereLight`(DirectionalLight) + takram `CascadedShadowMapsNode`(three CSM 확장, 캐스케이드 페이드). High: 4 캐스케이드×2048², 그림자 거리 600 m, cast = 건물·랜드마크, HLOD 제외. 방향은 **sim이 계산**(suncalc + 수렴각, 1 km 격자 관측점)해 `EnvironmentState.sunDirWF`로 전달, render는 소비만(ADR-0029) |
| 하늘/대기 | `@takram/three-atmosphere/webgpu` 0.19.1(+ r186 호환 패치) — `AtmosphereContext`(WF→ECEF: 원점 위치·NUE·수렴각 γ·지오이드 36.7 m) + `AtmosphereLight`(직사·하늘 간접) + `skyBackground()` + 후처리 `aerialPerspective`(ADR-0028) |
| 환경 조명 | `SkyEnvironmentNode`(하늘 64² 큐브 → PMREM) = `scene.environmentNode`, 라이트 간접 끔. 갱신 = 카메라 1 km 이동 또는 태양 각도 변화(라이브러리 임계값, 분할 렌더 안 함 — ADR-0028) |
| 간접광 | `SSGINode`(High+), `GTAONode`(Medium+). 플레이어 주변 `LightProbeGrid`는 M09-T03에서 효용 평가 후 채택 |
| 야간 광원 | `ClusteredLightsNode` — 반경 300 m 내 최대 1024개(가로등 4000 K LED, 편의점풍 5500 K, 주거 2700 K). 원거리는 발광 스프라이트 + 블룸 |
| 신호/차량등 | 발광 머티리얼 + 근거리만 실제 광원. 신호 렌즈 = 소품 풀 `_ptype.y`(렌즈 표식) × 인스턴스 `_itype.y`(램프 값, `setSignalLamps`) 일치 시 정점색 × 6 발광(M06-T02, ADR-0062) |
| 안개 | 고도 감쇠 높이 안개 + 대기 공중원근 강도(습도·비와 연동) |

## 7. 후처리 파이프라인 (`RenderPipeline`, r183+ 명칭)
```
scenePass(MRT: color, normal, depth, velocity, metalRough)
 → GTAO → SSGI → SSR → 대기 공중원근/높이안개 합성 → 볼류메트릭 구름 합성(Ultra)
 → 비·눈 입자(별도 패스, 깊이 테스트) → Bloom → 자동노출(휘도 히스토그램 EMA)
 → TRAA 또는 TAAU(렌더 스케일 < 1) → 톤매핑(AgX) → LUT 그레이딩(시간·날씨별 3D LUT)
 → Sharpen → 비네팅/필름그레인(약하게) → 출력
```
- **확정 순서(M03-T07, ADR-0035, `post/pipeline.ts`)**: 씬 패스 MRT(output RGBA16F · normal+roughness RGBA8 · velocity · [diffuse+metalness RGBA8] = 24 B/샘플,
  기본 한도 32 B 안) → GTAO(합성 곱) 또는 SSGI(AO 곱 + diffuse × GI) → SSR(가산, ½ × 렌더 스케일, 비금속 포함) → 공중원근(aerialPerspective, 하늘 포함)
  → 자동 노출(곱) → Bloom(가산, ¼ 해상도) → TRAA(스케일 1) 또는 TAAU(스케일 < 1 — 앞 단계 전부 렌더 스케일 해상도) → renderOutput(AgX·sRGB) → 3D LUT → Sharpen.
  공중원근은 Low–High = **저해상도**(`post/aerial.ts`, 렌더 스케일 ½×½ MRT S·T → 깊이 인지 업샘플, 태양·달 원반만 렌더 스케일), Ultra = takram 픽셀마다(ADR-0039).
  비·눈 입자·볼류메트릭 구름·비네팅/필름그레인은 해당 태스크(M06·M08)에서 이 순서에 끼운다.
- 자동 노출(`post/exposure.ts`): 씬 패스 HDR(하늘 제외)을 32² 격자로 컴퓨트 1회 → 로그 평균 EMA(τ 0.8 s, 스토리지 버퍼) →
  배율 = (0.12 / 기하 평균)^0.4, [0.5, 4] — **부분 적응**(완전 적응은 골목 뷰를 8배로 밝혔다). CPU 읽기는 통계용으로 30프레임마다.
- 3D LUT(`post/lut.ts`): 절차 생성 32³(약한 S 커브·채도 +6 %·그림자 차갑게/하이라이트 따뜻하게). 시간·날씨 LUT 전환은 M08.
- 포토모드: `DepthOfFieldNode`, 렌더 스케일 1.5×(SSAA), 모션블러 옵션, LUT 선택, 노출/화이트밸런스 수동.

## 8. 날씨·계절 표현
| 상태 | 렌더링 |
|---|---|
| 비 | `wetness` 0→1 (5분 게임시간), 수평면(normal.y>0.95) 물웅덩이 노이즈 마스크 + 파문 노멀, 거칠기↓, 빗줄기 입자(WebGPU compute, 카메라 40 m 원통), 차량 헤드라이트 반사 강조 |
| 흐림/안개 | 태양 조도 감쇠, 하늘 산란 파라미터, 안개 밀도 |
| 눈(희귀) | `snowCover` 상향면 블렌드, 입자 |
| 구름 | Ultra: TSL 레이마치 볼류메트릭(1/4 해상도 + 시간 재투영). High/Medium: 2D 레이어 구름(조명 반영). Low: 하늘만 |
| 계절 | 나무 틴트 테이블: 은행나무 황엽 11/15–12/10, 벚꽃 3/25–4/8, 느티나무 갈색 11월, 겨울 낙엽수 가지만. 보행자 옷 팔레트(겨울 코트, 여름 반팔). 나무 구현 = `trees/season.ts`(dayOfYear → 수종 색·잎 밀도, M05-T04) |

## 9. 품질 티어
| 항목 | Low | Medium | High | Ultra |
|---|---|---|---|---|
| 렌더 스케일(TAAU) | 0.6 | 0.75 | 0.85 | 1.0 |
| 그림자 | 2×1024, 150 m | 3×1536, 300 m | 4×2048, 600 m | 4×4096, 800 m |
| 공중원근 | ½×½ | ½×½ | ½×½ | 픽셀마다 |
| AO / GI / SSR | – / – / – | GTAO / – / – | GTAO / SSGI(½) / SSR | GTAO / SSGI / SSR |
| 클러스터 광원 | 64 | 256 | 1024 | 2048 |
| 구름 | 하늘만 | 2D | 2D | 볼류메트릭 |
| 보행자(근거리 A/총) | 60/200 | 120/500 | 250/1000 | 400/2000 |
| L0 반경 배율 | 0.75 | 1.0 | 1.0 | 1.25 |
- **M03-T07 이탈(ADR-0035)**: 1440p RTX 3050 Laptop 실측으로 High의 SSGI(½)를 GTAO로 — r186 SSGINode는 해상도 배율이 없고 +100 ms 이상.
  High = GTAO(½, 8표본 — 고정 노이즈 + 5×5 깊이 인지 블러, ADR-0038) + SSR(½) + Bloom + 자동 노출 + TAAU 0.85 + LUT, Sharpen은 Ultra만(2.2 ms). `RenderConfig.quality`·`post`(`?quality=`·`?post=`).
- 그림자 구현(ADR-0039): 티어 행대로(캐스케이드 수가 바뀌면 받는 머티리얼 재컴파일). 갱신: 움직일 때 가까운 캐스케이드 매 프레임 + 먼 캐스케이드 프레임당 하나,
  카메라·장면 정지면 15프레임마다 하나(태양 추적). 건물 파사드는 깊이 프리패스 쌍둥이(renderOrder −1), HLOD는 페이드 중에만 alphaHash 변형.
- 초기 티어: `detect-gpu` 결과 + 60프레임 측정. 실행 중 **동적 해상도**: 목표 프레임 16.6 ms 유지 위해 렌더 스케일 ±0.05(범위 0.5–1.0).
  구현(M03-T08, ADR-0036): 첫 표시 뒤 스트리밍이 조용해지면 `render.detectQuality()`(detect-gpu 벤치마크 JSON 자체 호스팅 `/detect-gpu/`, 0–1 low · 2 medium · 3 high, Ultra는 사용자) →
  저장(localStorage `sanpo.quality.v1`, 다음 부팅은 감지 생략) → 동적 해상도가 0.5 바닥인데 EMA > 20 ms면 한 단계 강등(반복). `?quality=`·골든뷰는 고정.
  소프트웨어 래스터(SwiftShader 등)는 detect-gpu를 부르지 않고 Low(차단 목록 티어 0과 같음 — 판정용 WebGL 컨텍스트 생성이 CI에서 메인 스레드를 16 s 막았다, M05 결정 0).
  동적 해상도(`renderer/dynamic-resolution.ts`): 20프레임마다 EMA > 17.5 ms면 −0.05, 17.1 ms 아래로 2 s 머물면 +0.05 시도, 시도 직후 넘치면 되돌리고 대기 2배(≤ 30 s).
  60 Hz 수직 동기에선 dt가 16.7 ms에 붙어 여유를 직접 못 재므로 "시도-후퇴"로. 스케일은 PassNode·중간 RTT·GTAO·SSR의 `resolutionScale`만 바꾼다(재컴파일 없음) —
  그래서 TAA는 항상 TAAU. 해상도에 비례하지 않는 고정 비용(TAAU 해석·출력 변환, 1440p 3050 Laptop ≈ 8 ms)은 동적 해상도로 못 줄인다.
- WebGL2 폴백: 최대 Medium, compute 입자 → CPU 입자(개수 1/4), 클러스터 광원은 백엔드 지원 여부 확인 후 미지원 시 64개 고정 포워드.
  구현(M03-T09, ADR-0037): **하드웨어 WebGL2** = WebGPU와 같은 후처리(Medium: GTAO·Bloom·TAAU 0.75·LUT) + 환경 프로브 + CSM 그림자, 자동 노출(컴퓨트)만 끄고 고정 배율 1.25,
  유리 거칠기 하한 0.16(프로브만 비쳐 거울 띠가 과함). **소프트웨어 WebGL2**(SwiftShader·llvmpipe — CI, WEBGL_debug_renderer_info로 판정) = 직접 렌더(ADR-0028).
  WebGL2 파사드 어두움은 GTAO 위치 복원(three `getViewPosition`이 역-Z 0..1 깊이를 −1..1로 변환) → three 패치로 해결(ADR-0040).

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
