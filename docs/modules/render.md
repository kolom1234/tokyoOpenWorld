# @sanpo/render
Layer: L3 | Depends: core, geo, tile-format(타입), three@0.186.1, @takram/three-atmosphere@0.19.1 + three-geospatial@0.9.1(/webgpu, r186 패치 — ADR-0028), meshoptimizer | Used by: apps/game

## Purpose
WebGPU(폴백 WebGL2) 렌더링 전부: 씬 그래프·원점 재설정, 셀 메시화, 고정 머티리얼 클래스(TSL), 대기·태양·그림자·야간 광원, 후처리, 인스턴스 레이어(보행자·교통·열차), 품질 티어, 스크린샷.
상세: `docs/07-rendering.md` (API 전문 §11, 파일 구성 §12).

## Public API (M01-T06 구현분 — 07 §11의 부분집합)
```ts
createRender(deps: { canvas: HTMLCanvasElement; bus: EventBus; log: Logger; config?: DeepPartial<RenderConfig> }): Promise<RenderService>
RenderConfig { backend: 'auto' | 'webgl'; farM (60 km); maxPixelRatio (2); rebaseDistanceM (2048); rebaseGridM (256); basisPath ('/basis/'); exposure (3); gpuTiming (false); shadows (true); facade ('procedural' | 'flat'); quality (QualityTier 'high'); post (Partial<PostEffects> 덮어쓰기) }  // M03-T07
QualityTier = 'low'|'medium'|'high'|'ultra'; PostEffects { ao: 'none'|'gtao'|'ssgi'; aoScale; ssr; bloom; autoExposure; taa; lut; sharpen; renderScale; fixedExposure? }  // WebGL2: autoExposure 끔 + fixedExposure 1.25 (M03-T09)
RenderStats += post: PostEffects | null, exposure: { lum, scale } | null, quality: { tier, renderScale, dynamic, frameMs }
RenderConfig += dynamicResolution (true), gpuBenchmarksPath ('/detect-gpu/'), debugGpuLoad (0)  // M03-T08
RenderConfig += debugForcePost (false)  // 소프트웨어 래스터에서도 후처리 체인(CI 정지 떨림 e2e, ADR-0038)
PostEffects += aerial: 'full' | 'half'   // 공중원근 해상도(Low–High half, Ultra full, `?post=aerial:full`) — ADR-0039
RenderStats += shadows: { cascades, mapSize, maxFarM, updated } | null;  gpu.passes: GpuPassTime[] { index, label, ms }  // ADR-0039
RenderStats += props: { instances, visible, pools, rebuilds, dropped }  // M05-T03 거리 소품: LOD당 InstancedMesh 1개(전 종류 합친 기하) → pools = 소품 드로우콜 ≤ 3, dropped = 고정 용량 초과, ADR-0051
RenderStats += trees: { instances, visible, pools, dropped, ready }; RenderService += loadTrees(urls: TreeAssetUrls{manifest, glb, leaves, impostor}): Promise<void>  // M05-T04 ADR-0052 — 첫 표시 뒤
RenderStats += signs: { instances, visible, pools, ready }; RenderService += loadSignage(urls: SignageAssetUrls{atlas}): Promise<void>  // M05-T06 ADR-0054 — 첫 표시 뒤, 파사드 간판 띠도 같은 아틀라스
RenderService += setQuality(tier), detectQuality(): Promise<QualityTier>  // 버스 'quality/changed'도 적용(되먹임 없음), 자기 변경은 방출. 소프트웨어 래스터 = detect-gpu 생략 → low
QualityTier = @sanpo/core 재수출
RenderService extends SystemProvider {            // systems: renderPrep(70), render(80)
  readonly renderOriginWF: Readonly<Vec3d>;
  readonly backend: 'webgpu' | 'webgl2';           // 초기화 후 실제 백엔드
  readonly depth: 'reversed-z' | 'logarithmic' | 'standard';   // ADR-0006
  addCell(p: CellPayload): void;                   // 소유권 이전(배열 그대로 GPU 버퍼), 같은 키면 교체. hlod.mesh → 셀당 draw 2(`_CHILD` → f32 `_child`)
  removeCell(key: CellKey): void;
  setHlodChildVisible(parent: CellKey, child: number /*0..15*/, visible: boolean): void;  // false = 0.3 s 디더 페이드, true = 즉시(M02-T05)
  loadMaterials(manifestUrl): Promise<MaterialLibraryStats>;  // M03-T01: manifest → 평균색 → KTX2 배열 3장 교체(재컴파일 없음), 첫 표시 뒤 호출
  precompile(onProgress?: (p: PrecompileProgress) => void): Promise<void>;   // 대기 LUT → 머티리얼 ID 묶음마다 1프레임 양보 → 아바타 (M06, PrecompileProgress{stage,done,total})
  stageCells(on); compileStaged(): Promise<void>; commitStaged();
  setSignalLamps(lamp: ((code) => number) | null): void;   // M06-T02(ADR-0062): props 신호 기둥 현시 코드 → 램프 값(차량 1–3 + 4 × 보행 1–2), 보이는 슬롯만·바뀐 범위만 업로드. 소품 풀 정점 버퍼 ≤ 8(_ptype·_itype = vec2). 램프 범위는 같은 프레임 풀 재작성 범위와 **합친다**(지우면 다른 소품 `_itype`가 GPU에 안 가 사라짐 — ADR-0068)
  debugLayerVisible(layer: RenderDebugLayer /* 'props'|'signs'|'trees'|'crowd'|'farCrowd'|'vehicles' */, visible): void;   // 디버그(ADR-0068): 인스턴스 레이어 숨김/보임 — e2e lod-continuity·실제 GPU 진단의 보임/숨김 픽셀 차
  readonly vehicles: VehicleLayer { bindShared(buf): Promise<void> };
  readonly trains: TrainLayer { bindShared(buf): Promise<void>; setStations(d: TrainStationsData | null) /* M07-T04: 승강장 삼각형·홈도어 판·문(f64 × 5)·문 열림 배열·띠 색 — 열차 머티리얼 재사용 */ };   // M07-T03(ADR-0072): sim 열차 칸 버퍼(메인 스레드 — 프레임마다 정확) → 가상 통근형 전동차 절차 모델(20 m 4문·16 m 3문 × 중간·팬터그래프·앞/뒤 운전실 × LOD 45/300/1600 m, LOD0 = 창 구멍 + 차내), 노선색 띠·문 미닫이·등화. stats.trains{cars, visible, pools, dropped, lods[3], ready}, debugLayerVisible('trains')   // M06-T06(ADR-0066): sim 교통 SAB → 가상 차종 7 절차 모델 × LOD 3, 처음 bind 때 풀·머티리얼 → compileAsync 뒤 그림. stats.vehicles{instances, visible, pools, dropped, casters, lods[3], ready}
  loadCrowd(urls: CrowdAssetUrls { manifest, bin, texture }): Promise<void>; readonly pedestrians: InstanceLayer { bindShared(buf), setFarDensity(k) /* M06-T04 원경 스프라이트 밀도 0..1, 기본 0 */ };   // M06-T01(ADR-0061): crowd/{assets,material,field} — 뼈 팔레트 스키닝, (베이스 × LOD) 48풀, 틱 사이 외삽, stats.crowd   // M06 사전 4(ADR-0060): 부팅 스폰 셀을 장면 밖 대기 그룹 → compileAsync(선컴파일과 겹침) → 붙이기                     // 대기 LUT 계산(await) + 고정 머티리얼 × {기본, HLOD} compileAsync
  setCamera(c: CameraState): void;                 // WF float64 — 다음 renderPrep에서 반영
  setAvatar(a: AvatarState): void;                 // 플레이어 아바타(자체 절차 마네킹, dynamic 루트, 속도 블렌드·근접 디더 페이드 — M04-T05, ADR-0045)
  loadAvatar(urls: AvatarAssetUrls { glb, texture }): Promise<void>;
  // 셀 슬롯 decals(M05-T02): materialId road_marking — materials/decal.ts(`_PAINT` → f32, 알파 테스트 마모, ADR-0050) + power_wire(M05-T03 전선, `_OFF` 거리 비례 최소 폭)
  // addCell의 instances.props(M05-T03) → props/pools(64 m 블록 LOD, 종류 × LOD InstancedMesh), removeCell·원점 재설정 동기                  // Rocketbox GLB + KTX2 아틀라스(library.ktx2 공유 로더) → 선컴파일 → 마네킹 교체(속력 블렌드 idle·walk·jog·sprint, 위상 공유 — ADR-0048·0057). 실패 = 마네킹 유지
  setEnvironment(e: EnvironmentState): void;       // M03-T02: sunDirWF·moonDirWF → 대기(ECEF). 천문 계산은 sim. M03-T06: weather.wetness → EnvUniforms.wetness(0..1 클램프)
  stats(): RenderStats;                            // backend, depth, frames, drawCalls, triangles, cells, originRebases, renderOriginWF, hlodParents, hlodFading, materials{state,layers,downloadBytes,gpuBytes,loadMs}, gpu{enabled,frameMs,samples}
  dispose(): void;
}
```
미구현(M03~): `setQuality`, `layers`, `screenshot`, `deps.assets`(머티리얼은 `loadMaterials(url)`로 대체).

## Invariants
- 건물 파사드 메시마다 깊이 프리패스 쌍둥이(같은 지오메트리, renderOrder −1, colorWrite false). HLOD는 페이드 중인 셀만 alphaHash 변형(`syncHlodMaterials`, renderPrep) — ADR-0039.
- 그림자 캐스케이드는 `autoUpdate = false` — renderPrep의 `shadows.schedule()`만 `needsUpdate`를 켠다(카메라·장면 변화, 원점 재설정 = 전부).
- 머티리얼 클래스는 07 §4 고정 목록. 새 클래스 추가 = 문서 갱신 + precompile 목록 추가. (M01: `terrain_ground`·`facade_default` 단색 PBR, 모르는 ID는 마젠타)
- 씬 노드 위치 = (WF − renderOrigin)을 float64로 계산 후 대입. 누적 이동 금지. 재설정·카메라 대입은 같은 renderPrep 안(한 프레임 튐 없음).
- 원점 재설정: 카메라가 renderOrigin에서 ≥ 2048 m(3D) → x·z를 256 m 격자에 스냅(y = 0), `origin/rebased` 발행.
- `DecodedMesh` 속성 이름은 glTF 의미 이름 → render가 three 이름으로 변환(ADR-0020). 경계는 `boundsLocal` 사용(정점 순회 없음).
- 셀 텍스처 없음: 모든 텍스처는 shared 머티리얼 배열(ADR-0027). 그룹 이름 `MATERIAL_GROUPS`는 파이프라인 library.json group과 1:1(추가는 끝에만).
- 셰이더 해시 입력은 작은 정수만 varying으로(`_bldg` → 반올림 → uint 결합). 큰 float varying 보간 = 픽셀 노이즈(ADR-0027 §5).
- 면·건물 상수 속성(`_facade`, UV1)은 **flat varying**(ADR-0030 §4) — 보간 오차가 정수 경계에서 격자를 뒤집는다.
- 텍스처 교체 대상(자리표시)은 최종 텍스처와 같은 샘플러 필터를 가진다(밉맵 선형·이방성 8).
- 메인 스레드 GPU 업로드는 streaming 적용 예산(2 ms + 4 MiB/프레임, apps/game 배선) 안에서만.
- HLOD 머티리얼은 머티리얼 ID당 1개(셀별 페이드는 per-object uniform `userData.hlodFade` Vector4 × 4) → 셀이 늘어도 파이프라인 불변. 페이드 0 = 정점 붕괴(ADR-0025).
- 자식 표시 상태는 부모 도착 전에도 보관(도착 순서 무관), 보임은 항상 즉시(자식 제거 전 → 구멍 없음).
- 태양·달 방향은 계산하지 않는다(sim의 `EnvironmentState` 소비). 연결 전 기본 = 방위 200°·고도 50°. 광원 = takram `AtmosphereLight` 1개(+ 환경 PMREM), 하늘 = `skyBackground`.
- WF → ECEF(`lighting/atmosphere.ts worldToEcef`)는 원점 재설정마다 다시 계산. 레이마칭 산란은 TAA 전까지 끔(결정론).
- WebGPU = 후처리 파이프라인(`pass().setMRT(mrt({output}))` → aerialPerspective), WebGL2 = 직접 렌더(T08/T09 전 임시, ADR-0028).
- 실존 상표·로고 텍스처 금지(M_SIGN은 가상 브랜드 아틀라스만). 차량 = 실존 차명·엠블럼·번호판 없음(M06-T06).
- positionNode로 인스턴스를 놓는 머티리얼은 `positionPrevious`도 같은 변환(지난 프레임 위치)으로 — 아니면 three 속도 노드가 변환 전 정점을 써서 TAA가 히스토리를 버린다(계단·반짝임). 차량(`_imove`)·군중(`_ivar.zw`) 적용(M06-T06), 나무·간판·원경 스프라이트는 별도 작업.
- WebGPU 정점 버퍼 ≤ 8: 차량 = 위치·법선·색·`_vpart` + `_ipos`·`_ivar`·`_imove` = 7(단위 테스트).

## Files
context(초기화·씬·머티리얼·대기·후처리 묶음), frame(renderPrep 70·render 80), renderer/(init — WebGPURenderer·깊이 전략·trackTimestamp, backend-caps — WebGPU 어댑터·EXT_clip_control·소프트웨어 래스터 판정(M03-T09), gpu-timer — timestamp 평균 + 패스별 순번 분해(ADR-0039)), lighting/(atmosphere — Context·Light·(WebGL2만)하늘 배경·WF→ECEF·LUT prepare·별 끔(외부 데이터), env-probe — SkyEnvironmentNode(WebGPU만), shadows — CSM(takram CascadedShadowMapsNode) 티어(SHADOW_TIERS)·갱신 스케줄(cascadeDue, ADR-0039), sun — 방향 규약·기본값), post/(aerial — 저해상도 공중원근 LowResAerialNode(MRT S·T)·composeAerial(깊이 인지 업샘플 + 태양·달 원반, ADR-0039), ao-filter — GTAO 고정 노이즈용 5×5 깊이 인지 블러 RTT(ADR-0038), pipeline — MRT → GTAO/SSGI → SSR → aerialPerspective → 노출 → Bloom → TRAA/TAAU → AgX → LUT → Sharpen / 직접 렌더, config — 티어 표·resolvePost, exposure — 컴퓨트 자동 노출, lut — 절차 3D LUT, ADR-0035), scene/(scene-graph, avatar — 절차 마네킹·대기/걷기/달리기 블렌드·opacity alphaHash(ADR-0045)·`attach(model)`, avatar-model — GLB → 키 1.72 m·정면 −Z·정점색 머티리얼·blendWeights/clipRate(ADR-0048), cell-node — DecodedMesh→Mesh·CellSet·`_CHILD` 변환, origin — 재설정 순수 계산, render-view — WF 카메라·재설정 실행, hlod-switch — 자식 표시·페이드 상태), materials/(facade/ — 절차 파사드 grid·walls(평지붕 방수 마감 색, M05-T07)·windows·retail·details·interior(실내 매핑, ADR-0034)·balcony(맨션 발코니 시차, ADR-0055)·index(ADR-0030), glass — 유리 셰이딩(프레넬 투과·블라인드·interiorExposure·glassRoughness(WebGL2 0.16)), registry — 기본·HLOD(`facade: 'flat'` 비교 모드), library — KTX2 배열(+ 실내 큐브맵 `maps.interiors`·방 평균색)·manifest·평균색·그룹 uniform, ktx2-csp — 트랜스코더를 정적 부트스트랩 워커(`<basisPath>ktx2-worker.js`)로(ADR-0032), textured — sampleLayer·tsToWorld·worldToView·perturbWorld, terrain — `_SURF` 2클래스 스플랫·안티타일링·경사 triplanar 옵션(M03-T06), road — 아스팔트·보도 변형(noiseBank 채널), noise — 256² 격자값 텍스처·noiseBank(4축척 × 4채널), hlod — TSL 자식 페이드·붕괴, precompile — 셀과 같은 속성 형식 더미, prop — street_prop(정점색 × 인스턴스 색)·power_wire, landmark — overrides.mesh `_LMAT`(→ f32) 15종 표 + 절차 무늬·가상 영상 화면(M05-T05, ADR-0053)), vehicles/(builder — 육면체·바퀴 조립(`_vpart` 부품 코드·축), models — 7종 × LOD 0–2(35/110/520 m)·도장 팔레트(가상), material — 클리어코트 도장·유리·바퀴 회전·등화(밤 = 태양 고도, 제동·깜빡이 flags)·positionPrevious, field — (차종 × LOD) 풀 21·외삽·시야 원뿔·그림자 LOD 0–1, M06-T06 ADR-0066 — builder VPART에 열차 부품 doorLeaf·lcd·cabinLight·stainless 추가(M07-T03)), trains/(parts — 차형 치수·지붕·대차·운전실 앞면·팬터그래프·빗각 막대, body — 창 구멍 벽·문짝·끝벽·차내, models — 차형 × 종류 × LOD, material — `train`(pitch·yaw·문 미닫이·노선색·발광·positionPrevious), field — 풀 24·LOD·시야, M07-T03 ADR-0072), crowd/(assets·material·field — M06-T01, far — 원경 tier C 스프라이트(보도 삼각형 점·235–800 m·디더 페이드, `stats.crowd.far`) M06-T04 ADR-0064), signs/(atlas — 색까지 구운 간판 아틀라스 노드·signFace·signBg(파사드 간판 띠 공유), models — 돌출 상자·입간판·옥상 광고탑 단위 모델(`_face`), field — 종류별 풀·거리 채우기·위치 해시 브랜드, material — `sign`, load — 아틀라스 적재·선컴파일, M05-T06 ADR-0054), props/(geo — 상자·원기둥·삼각판 정점색 조립, models — PROP_TYPE별 LOD 0–2 절차 모델(로고 없음)·LOD별 합친 기하(`_ptype`), blocks — 64 m 블록 조각·거리 LOD 띠(히스테리시스), pools — PropField: LOD당 고정 용량 풀 1개(`_itype`)·바뀐 LOD만 재작성·선컴파일 priming, ADR-0051), trees/(blocks — 64 m 블록·수종 조각·LOD 띠 30/60/2000 m, pools — Mesh + InstancedBufferGeometry 풀(수피·잎이 인스턴스 속성 공유), field — TreeField(attach·채우기·priming 복원 시 재충전), materials — 수피·잎·임포스터 TSL(바람·계절·반팔면체), season — 07 §8 표, assets — GLB(meshopt)·PNG 적재, load — 하늘 간접광 보조 AtmosphereLight·선컴파일, ADR-0052), lighting/sun, weather/(wetness — EnvUniforms·applyWetness, M03-T06), config.ts, quality.ts(티어 관리자 — detect-gpu·60프레임 강등·버스), renderer/dynamic-resolution.ts(프레임 EMA 컨트롤러), service.ts.
컬링은 three 메시별 프러스텀 컬링(boundsLocal 구) — 별도 culling.ts 없음(필요 시 perf 후).
예정: renderer/dynamic-resolution, scene/(culling, hlod-switch), materials/(terrain, road, decal, facade/*, glass, …), lighting/(atmosphere, env-probe, clustered, night-lights), post/*, weather/*, instances/*, debug/overlay.

## Tests
- 단위(test/): 원점 재설정 판정·스냅·왕복 비트 일치·float32 정밀도, 깊이 모드 판정, 태양 방향, DecodedMesh→BufferGeometry(이름 변환·무복사·경계), HLOD 전환(hlod.test: 페이드·즉시 보임·늦은 부모·정리, `_CHILD` f32), materials.test(라이브러리 실패 경로·레지스트리·셀 시드), avatar.test(원점 기준 위치·yaw, 대기·걷기·달리기 진폭·기울기, 숨김), avatar-model.test(블렌드 매듭·재생 속도 자르기, 합성 씬 배율·교체), props.test(모델 전 종류·LOD 단조·감기, bandOf 히스테리시스, 풀 원점 평행이동·용량 증가·모르는 종류 무시), trees.test(계절 표 날짜, 띠, 블록·yaw, 풀 채우기·절단, priming 복원 재충전), trains.test(M07-T03: 치수·감기·LOD 단조·정점 버퍼 ≤ 8·부품(띠·문짝·운전실 등화·LOD0 차내)·팬터그래프 5.2 m·필드 코드 해석·LOD·컬링), vehicles.test(M06-T06: 치수 = VEHICLE_TYPES·LOD 단조·감기 = 법선·바퀴 축 반경·등화 부품·가상 색·밤 계수, 정점 버퍼 ≤ 8, 필드 차종·LOD·외삽·뒤 컬링·색/flags).
- E2E(tests/e2e/render.spec.ts, WebGL2/SwiftShader): 시작 화면 건물 픽셀 비율, 원점 재설정 왕복 전후 픽셀 차 0. flicker.spec.ts: `?forcePost=1` 정지 카메라 연속 프레임 휘도 차(ADR-0038).
- 시각: 골든뷰(`pnpm golden`, 14 §3, tests/golden/README.md). 성능: `pnpm perf`.

## Status
M01-T06 최소 구현(초기화·reversed-Z·방향광·셀 메시·원점 재설정) + M02-T05 HLOD 자식 전환·선컴파일(ADR-0025) → M03 본격(머티리얼·대기·후처리). M04-T05 아바타(`setAvatar`, 선컴파일 포함).

## Gotchas
- GPU 타이머는 풀 `timestamps` 합산(three 반환값은 마지막 frame id만 — ADR-0029 §6). 그림자는 `renderer.shadowMap.enabled` 필수.
- WebGPU 경로에 `scene.backgroundNode`를 두지 말 것(환경 프로브와 겹치면 배경 머티리얼 매 프레임 재빌드, ADR-0029 §5).
- three r186 패치(ADR-0040): `getViewPosition` 역-Z 분기 — 없으면 WebGL2(EXT_clip_control)에서 GTAO·TAAU 히스토리 검증이 틀린 위치를 복원(파사드가 어둡다).
- takram 0.19.1 × three r186: 패치 필수(struct Proxy, requestIdleCallback 타임아웃). LUT가 0이면 조명·하늘이 **검게** 나온다 — `precompile()`의 LUT prepare 확인.
- 게임 번들은 `three` → `apps/game/src/three-compat.ts` alias(WebGLCubeRenderTarget·WebGLRenderer 대체). render 패키지 테스트(Node)는 실제 `three`를 쓴다.
- three r186 명칭: 후처리는 `RenderPipeline`(구 PostProcessing), `PCFSoftShadowMap` 제거됨. addon 이름은 `node_modules/three/examples/jsm/{tsl/display,lighting,lights}`에서 확인.
- `reversedDepthBuffer`·`logarithmicDepthBuffer`는 생성자 옵션(이후 readonly). WebGL2는 `EXT_clip_control` 없으면 three가 조용히 표준 깊이로 폴백 → `backend-caps.ts`로 미리 판정.
- WebGPU는 `snorm8x3`·`unorm16x3` 정점 형식이 없다 → three가 업로드 시 4성분으로 패딩(WebGPUAttributeUtils). 밀집 3성분 배열을 그대로 넘겨도 된다.
- takram atmosphere의 WebGPU 노드명은 `@takram/three-atmosphere/webgpu` 타입 정의 확인 후 사용.
