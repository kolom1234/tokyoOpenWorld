# apps/game (Composition Root)
Layer: L5 | Depends: 모든 @sanpo 패키지 | Used by: apps/worker(정적 에셋으로 서빙)

## Purpose
브라우저 엔트리. 기능 감지 → 서비스 생성 → 패키지 간 배선 → 루프 실행. **게임 로직을 두지 않는다**(배선·설정·부트만).

## 부트 시퀀스 (src/boot.ts)
```
1. caps = detectCaps()                       // WebGPU, crossOriginIsolated, cores, detect-gpu 티어
2. log, bus, scheduler = core
3. cfg = mergeConfig(defaults, config/*.json, urlFlags)
4. { buildId, baseUrl } = GET /api/world/current?fv=FORMAT_VERSION (또는 `?world=mini` → /fixtures/world-mini, ADR-0019) → world.json 로드, geo 원점 검증 (구현: world-load.ts)
5. ui = mountUi(root, bridge)                // 로딩 화면 먼저
6. streaming = createStreaming(...)          // cells.idx
7. render = await createRender(...); physics = createPhysics(...); sim = createSim(...); audio = createAudio(...); input = createInput(...)
8. traversal = createTraversal({ physics, input, bus, ground: streaming, trains: () => sim.trainsNear(player, 300) })
9. wiring: streaming.onReady → render/sim/audio/traversal.interactables/ui(meta), 물리 반경 셀 → streaming.requestSections → physics.addCell, sim↔physics(MessageChannel), sim.outputs() → render.layers.*.bindShared, traversal 관심점 → streaming.setInterest, sim.environment() → render.setEnvironment/audio
   scheduler.setFrameSource({ camera: () => traversal.camera, player: () => traversal.player, gameTimeMs: () => sim.clock.gameTimeMs, timeScale: () => sim.clock.timeScale })
10. await streaming.whenReady({ centerWF: spawn.posWF, radius: 384, levels: [0,1,2,3] }) ; await physics.ready ; await render.precompile()
11. scheduler.add(각 서비스: SystemProvider) → loop.start()
```

## Files
| 파일 | 책임 |
|---|---|
| index.html, vite.config.ts | Vite 엔트리. `three` → `three/webgpu` alias(addon 중복 번들 방지) + `sanpo-basis-transcoder`(`/basis/*` = three examples/jsm/libs/basis, dev 서빙·build 복사) + dev 서버 격리 헤더 + `/api`·`/world` → `wrangler dev`(8787) 프록시 + `sanpo-world-mini` 플러그인(dev 서빙, build 시 `dist/fixtures/world-mini` 복사, `SANPO_WORLD_MINI=0`이면 생략) + `sanpo-local-build`(dev 전용 `/local-world` → `data/build/<SANPO_LOCAL_BUILD | 최신>`) |
| public/_headers | 정적 에셋 COOP/COEP/CORP/CSP·Referrer-Policy·Permissions-Policy·캐시 헤더(docs/13 §3) — Worker를 거치지 않는 응답용. HSTS는 넣지 않음(Cloudflare 존, ADR-0102). `/basis/ktx2-worker.js`만 별도 CSP('unsafe-eval', ADR-0032) |
| vite.config.ts `sanpo-gpu-benchmarks` | detect-gpu 벤치마크 JSON → `/detect-gpu/*`(dev 서빙·build 복사) |
| public/basis/ktx2-worker.js | KTX2 트랜스코더 부트스트랩 워커(첫 메시지 본문을 전역 eval — render `materials/ktx2-csp.ts`와 짝) |
| src/main.ts | 엔트리: 상태 화면(숨김) + UI 셸(`#ui`, shell/bridge) → boot(view, flags, shell), `?probe=decode|physics`면 부트 대신 프로브, `?ui-sandbox=1`이면 UI만 — 이 둘과 `?report=force`는 `__SANPO_DEBUG_TOOLS__`(production 배포 빌드 false — 청크째 제외, ADR-0103) |
| src/captions.ts | 효과음 자막(M11-T04 ADR-0099): AudioService Proxy — 역·문·차내 차임·개찰구·거부·자전거 벨 재생 때 shell/hud-state `pushCaption`(30 m 안, 2 s 반복 없음). world-audio `startAudio`가 감싼다 |
| src/error-report.ts | 오류 보고(M11-T03 ADR-0098): window error·unhandledrejection → 세션 1 % 추첨(`?report=force` 100 % — production 빌드 제외)·세션 3건·중복 1번(`dedupeKey` — 종류 + 숫자만 다른 메시지 같음, F03) → `POST /api/log`(메시지·첫 프레임 경로·빌드·`__SANPO_VERSION__`·백엔드·품질 티어·브라우저 계열/주 버전·언어·화면). main.ts가 설치 |
| src/caps.ts | 기능 감지 `detectCaps(env?)` → `Caps`(webgpu `available/no-adapter/unsupported`, crossOriginIsolated, `IsolationMode`, decodeWorkers) |
| src/boot.ts | 위 시퀀스(M01: 1·2·4·7·8 일부 + 루프), `parseFlags`(`debug`, `world=mini|local`, `backend=webgl`, `probe=decode`, `view=<id>`, `exposure=<n>`, `sun=<방위>,<고도>`, `gpuTiming=1`, `time=<ISO>`, `clock=run`(time부터 1배속 — M06-T03), `crowd=agents|dummy|scramble|0`, `shadows=0`, `mode=freecam` — 첫 표시 freecam, 기본 walk ADR-0047, `spawn=<id>` 스폰 프리셋 ADR-0084), 전체 화면 캔버스, `startWorld`(API 또는 픽스처 → loadWorld → 상태, `LoadedWorld` 반환) → `world.showWorld`, 렌더 초기화 실패 시 오류 표시 + 유휴 루프, `createIdleFrameSource` |
| src/world-view.ts | (`start` 옵션: 골든뷰 시작 포즈·대기 중심·fov) 조립: `createRender`·`createInput(canvas)`·`createTraversal({ ground: streaming 높이장(프록시) }, 로딩 중 freecam)`·카메라 배선 → `providers`·`frameSource`. `render.precompile`은 `createRender` 직후 시작(ADR-0060). `showWorld(loaded)` = `render.stageCells(true)` → `createStreaming`(디코드 워커) + streaming-render 배선 → `whenReady(스폰 384 m, L0)` → `precompile ∥ compileStaged` → `commitStaged` → 시작: `startMode` walk(기본 — `startWalkParams`, ADR-0047) 또는 freecam 시작 시점(골든뷰·`?mode=freecam`) → `render.loadMaterials(materialsUrl)`(비동기, 첫 표시 뒤 — `materialsSettled`) → 스폰 3×3 live 수(M02-T05) |
| src/start-view.ts | `startWalkParams(spawnWF, yawRad, ground)` = 스폰 xz 눈높이(지면 + 1.6)·world.json 방위·피치 0(M05 결정 1). freecam 시작 시점: 스크램블 교차로 북서 상공(WF −60, −15) 지면 위 60 m → Scramble Square(WF 130.8, 130, 132.5) 바라봄 |
| content/sim/signal-plans.json | 신호 계획(M06-T02, ADR-0062) — `world-view.ts simFor`가 `createSim({signalPlans})`, 첫 표시 뒤 `render.setSignalLamps(signalLampsOf(sim))`(보행 점멸 0.5 s 실시간). 사이트 표는 파이프라인도 읽는다(코드의 계획 번호) |
| src/assets/characters/crowd.{json,bin,ktx2} | 군중 팩(파이프라인 `characters` 군중, ADR-0057·0061). `world-late.ts` `CROWD_URLS`, 첫 표시 뒤 `sim.startWorker`(`?crowd=` agents 기본·dummy·scramble(시험 250명)·0 끔 — M06-T03) → `render.pedestrians.bindShared` → `render.loadCrowd`(조정값 = content/sim/crowd.json) |
| src/world-late.ts | 첫 표시 뒤 적재(world-view에서 분리): 머티리얼·아바타·나무·간판·군중·신호 램프, `LateState`, `CrowdMode`, `crowdFarDensitySystem`(1 s마다 sim 군중 수 ÷ 1,000 → `render.pedestrians.setFarDensity`, M06-T04). 차량(M06-T06): `sim.outputs().traffic` → `render.vehicles.bindShared`, `sim.connectPhysics(port → physics.connectKinematicSource)`, `?traffic=0` = 교통 없음(비용 비교). 골든뷰 준비 조건 `crowdSettled`(군중 팩 + `crowd.filled`, M06-T07) |
| src/world-rail.ts | 철도(M07-T03, ADR-0072): 첫 표시 뒤 `global/rail.bin`(gzip)·`global/timetables/index.json`·노선 파일(노선 사이 1프레임 양보 — 파싱 1–2 ms) → `sim.setRail` → `render.trains.bindShared(sim.outputs().trains)`. 없으면(world-mini 404) 열차 없이. `?trains=0` 끔, 골든뷰 준비 조건 `trainsSettled` |
| src/world-extras.ts, src/world-parts.ts | 첫 표시 직후 부가 배선(오디오 + 역 — world-view 400줄 분리), world-view 보조(simFor·initialLate·startPrecompile·frameSourceOf) |
| src/station/{layout,wiring,stairs,platform-geo,hud}.ts | 역(M07-T06 ADR-0081·0082): access.json 출구 4역 → 개찰구 상자·플랩·물리·통과음(layout·wiring), 계단 F 이동(승강장 윗면 메시 + 가장자리 여유 `safeArrival`)·선로 구덩이 구조(`trackPits`, 격자 점진 생성)(stairs·platform-geo), 안내·페이드·알림(hud → shell/hud-state, 번역 키 — M10). `?debug=1` → `__SANPO_STATIONS__`(topAt·clearTopAt·inPit·targets — `pnpm stations`) |
| src/landing.ts | freecam G 카메라 아래 내리기(ADR-0083): 후보 25개(가운데 + 2·4·7 m 링) 함께 판정 — 아래 첫 걸을 수 있는 면(차양·데크 통과)·경사·승강장 가장자리·선로·차선(`roadIndex` — 셀 lanes.bin 지연 적재, 보도 tile 제외)·건물 안·머리 공간 → traversal `landing` 컨텍스트(world-extras 배선, `?debug=1` → `__SANPO_LANDING__`) |
| src/landing-hud.ts | freecam G 진행(안내 칸 landing)·실패 이유 알림(hud.landing seq) → shell/hud-state |
| src/shell/ | M10 UI 셸(ADR-0091): `bridge`(UiBridge 시그널 — HUD 10 Hz·로딩·설정, @sanpo/ui 마운트, 열기 단축키 pause·map·photo), `commands`(일시정지·시작·빠른 이동), `hud-state`(안내 칸·알림·역 안내·막 — Msg), `settings`(localStorage `sanpo.settings.v1` 로드·저장·적용: 품질·FOV·감도·모션·키·볼륨), `pause`(입력 끔·포인터 잠금·시계 멈춤·잠금 풀림 = 일시정지), `fast-travel`(검은 막 → walk 재진입 → 착지·스트리밍 조용 → 막), `loading`(StatusView → LoadingModel), `credits`(ATTRIBUTION → CreditsModel), `places`(M10-T02 ADR-0092 — live L0 셀 meta placeNames → 점-폴리곤 지명), `map-source`(M10-T03 — global/map.pmtiles 전체 받기(처음 필요할 때) → MVT 디코드, WF → 메르카토르), `travel`(빠른 이동 대상 = 역 개찰구·장소 프리셋, 시작 지점 3곳 열림·60 m 안 = 발견 + 발견한 명소 `poi:<id>`), `save`(M10-T06 ADR-0096 — IndexedDB `save/v2`·썸네일 `photo/<id>`, 부팅 때 모음 복원·이어하기 위치·자동 저장 60 s/모드 전환·내보내기/가져오기, 메뉴 모드만), `credits`(/credits.json·/oss-licenses.json·/oss-licenses.txt(LICENSE 원문 — M11-T05) — vite `sanpo-credits` = scripts/lib/credits.ts, 맨 위 ODbL 파생 DB 링크 `odblEntry` = `<world base>/global/odbl/README.txt`, 끝에 OSS 전문·제3자 고지 링크), `photo`(M10-T05 ADR-0095 — 포토 모드 진입·복원, render.setPhoto·screenshot, 초점 레이, 사진 → 가까운 발견 명소; 포토 모드 동안 포인터 잠금 풀기·`input.setPointerLockOnClick(false)` — 패널·끌기·우클릭에 커서, 일시정지 → 포토 모드는 잠금 요청 안 함), `pois`(M10-T04 ADR-0094 — content/poi(Wikidata 이름·좌표 + 자체 설명) → sim createPoiService 2 s 체류 → 기록·알림·DiscoveryModel), `options`(메뉴 모드: `?debug=1`·`?perf=1`(측정 핸들 `__SANPO_DEBUG__ = { world, scheduler }`만 — M11-T01)·`?view=`·`?spawn=`·`?mode=`·`?probe=` = 끔, `?title=1|0`) |
| src/debug/ui-sandbox.ts | `?ui-sandbox=1&screen=&lang=&pad=1` — 게임 없이 UI(목 브리지) |
| src/spawn-presets.ts, src/boot-flags.ts | `?spawn=<id>`(content/spawn-presets.json — ADR-0084): `withSpawn`가 LoadedWorld 스폰·3×3 셀을 바꿔 showWorld로, 로딩 freecam = 프리셋 위 30 m(`start-view.ts presetFreecamPose`), surface platform = world-extras가 승강장 윗면으로. boot 보조 플래그 파서(태양·군중·오디오) |
| src/station/guide.ts | 역 근접 안내 `guideModel`(개찰구 80 m·계단 15 m·승강장 출구 60 m, 시선 기준 방향 45° 단위 — 글은 UI가 3개 언어로) |
| src/train-lcd.ts | 차내 안내 화면(M07-T05, ADR-0074): train 모드 중 LCD 풍 DOM 패널(노선색 띠·방향·다음/정차 역·도착까지 분·문 쪽·경계역 안내, 일·영·한 4 s 순환, 자체 문구) + 빨리감기 검은 막(hud.fade). traversal 컨텍스트에 `trains`(300 m)·`trainCar`·`trainRide`·`jumpClock` 연결은 world-view `createTraversalFor` |
| src/boot-progress.ts | 로딩 패널 "준비" 행(M06 — 선컴파일 단계·스폰 셀 live 수·경과 s, ADR-0060 보충) |
| src/assets/characters/avatar-rb.{glb,ktx2} | 플레이어 아바타(파이프라인 `characters` 산출물, Microsoft Rocketbox MIT — ADR-0057). `world-view.ts` `AVATAR_URLS`(`new URL(…, import.meta.url)` → Vite 해시 에셋), 첫 표시 뒤 `render.loadAvatar({glb, texture})` → `avatarSettled` |
| src/credits.ts | 화면 오른쪽 아래 상시 출처 표기(`© OpenStreetMap contributors` · PLATEAU · 国土地理院 — ODbL Produced Work, M05-T02). 크레딧 화면 = UI(shell/credits) |
| src/wiring/camera.ts | phase 65: `render.setCamera(traversal.camera)` + `render.setAvatar(traversal.avatar)`(M04-T05) |
| src/debug/overlay.ts | `?debug=1` 오버레이(FPS·백엔드·깊이·카메라 WF·고도·원점·재설정 횟수·draw/tris·스트리밍 레벨별 상주/대기/fetch/디코드/실패·HLOD 부모/페이드, `data-*` e2e용 — `data-settled` = 스트리밍 0·페이드 0·`settledExtra`(머티리얼·첫 품질 티어), `data-mode`) + **O 키 원점 재설정 테스트**(+4096 m → 1 s → 복귀). `globalThis.__SANPO_DEBUG__ = { world, rebaseTest }`(디버그 모드만) |
| src/world-load.ts | `loadWorld(baseUrl, source, fetch?)` → `Result<LoadedWorld, string>`: world.json(`checkManifest`: formatVersion·WORLD_ORIGIN) → cells.idx(`cellsIndex`) → `spawnCells`(스폰 셀 ± 1 중 색인에 있는 L0), `spawnYawRad`(spawn.yawDeg), `materialsUrl`(files.materials, 픽스처 제외). 셀 fetch·검증은 streaming. `WORLD_MINI_BASE_URL`, `WORLD_LOCAL_BASE_URL`(`/local-world`) |
| src/loop.ts | rAF → scheduler.tick, `FrameHook`(before/after) |
| src/vehicles/ | M08-T01(ADR-0087): `player-cars`(세워 둔·부른 카셰어 차 — 콜라이더 적재 뒤 지면 레이로 spawnVehicle, 포즈·바퀴·등화 → render.vehicles.setPlayers, 젖음 → physics, 부른 차는 걷는 플레이어 200 m 밖이면 치움, 최대 3대), `curb-spot`(차 부르기 — 3×3 셀 연석 차선 laneIdx 0·교차로 9 m 밖·왼쪽으로 비킴), `drive-hud`(임시 DOM 계기판·"F 운전하기"), `wiring`(R·D-pad ← 차 부르기, B·D-pad → 자전거 부르기, 스폰 프리셋 `vehicles`(kind)), `vehicle-audio`(M08-T04 — drive·cycle 중 physics vehicleState·HUD → audio setVehicleState, 벨), 세워 둔 탈것 = 제동 + 핸드브레이크, 스폰 프리셋 `carshare-shibuya`·`bike-dock-harajuku`(거점 옆 타는 쪽), `share-spots`(M08-T02·T03 — live L0 셀 meta.json interactables carShare·bikeDock → 가까운 거점 2곳씩(130 m 안) 카셰어 1대·자전거 2대, 220 m 밖이면 치움, 타고 간 것은 거점에서 떼어 부른 것처럼 — 가상 브랜드 SANPO Car·SANPO Cycle), player-cars = 차·자전거 종류(KIND_LOOK — 렌더 차종 0·7, 도장, 바퀴, 하차 쪽). `hazards`(M08-T02 — sim 보행자·교통 SAB → AEB 원), `traffic-guide`(차가 있는 차선 → 제한 속도·역주행(좌측통행)·앞 정지선 적/황 거리(sim.signalStateAt)·적신호 통과 안내 — 벌점 없음), 탄것 치수 → sim(`wiring.playerFootprint`). `lane-chunks.ts` = lanes.bin 캐시(landing과 공유) |
| src/world-status.ts | `fetchWorldStatus()` → `WorldStatus`(ready/loaded/unconfigured/no-build/error). 기본 `fv` = `@sanpo/tile-format` `FORMAT_VERSION` |
| src/status-view.ts | 부트 상태 화면(M00 임시, `#app[data-isolated|data-webgpu|data-world|data-world-source|data-world-cells|data-backend|data-rendered-cells|data-error]` — e2e용). M10부터 화면에서는 늘 숨김(`#app.behind-ui`) — 로딩·오류는 UI 로딩 화면 |
| src/debug/stats.ts | `?debug=1` stats-gl 동적 import |
| src/debug/decode-probe.ts | `?probe=decode`(main.ts가 부트 대신 동적 import): world-mini 셀을 streaming `createFetcher` → `createDecodePool`로 2회(네트워크·Cache Storage) + 동시 4셀 + 취소 → 셀당 시간·정점/인덱스 수·긴 작업 → `globalThis.__SANPO_DECODE_PROBE__`, `#app[data-probe]`(e2e `decode.spec.ts`, ADR-0022) |
| src/wiring/streaming-render.ts | phase 45 `streaming.setInterest(traversal.interest)`, phase 55 적용(2 ms + 업로드 4 MiB/프레임, 첫 셀 보장): `addCell → ack('render') → 부모 HLOD 자식 숨김`, 해제 = `부모 보임 → removeCell`(M02-T05, ADR-0025). sim/audio/interactables 분배는 해당 태스크 |
| src/wiring/streaming-physics.ts | 물리 반경 필터, `requestSections` → physics.addCell/removeCell, `physics.setFocus(플레이어)`(앵커 재설정, M04-T06) |
| src/wiring/streaming-sim.ts | phase 57: live L0 셀 중 플레이어 448 m 안 → `requestSections(['nav.bin', 'lanes.bin'])` → `sim.addCell(key, nav, lanes)`, 560 m 밖·해제 → `sim.removeCell`(M06-T03·T05, ADR-0063·0065). 교통 조정값 = content/sim/traffic.json(world-late `startCrowdLater`) |
| src/wiring/sim-physics.ts | MessageChannel 생성·연결 |
| src/wiring/env.ts | phase 66 `render.setEnvironment(sim.environment())`(M03-T03, audio는 M10), `defaultClock`(오늘 12:00 JST custom 1배속). world-view가 `createSim`(골든뷰·`?time=` = frozen) 생성, frameSource 시각 = sim 시계 |
| src/wiring/ui-bridge.ts | UiBridge 구현(시그널) |
| src/workers/*.worker.ts | 패키지 워커 엔트리 재수출(Vite 워커 번들링용) |
| src/config/*.json | 기본 설정 오버라이드 |
| src/debug/sun-override.ts | `?sun=az,el` → phase 68 `render.setEnvironment`(태양 고정, 달 반대편) — 조명·대기 확인·T02 수락 캡처 |
| src/wiring/quality.ts | 품질 티어: `?quality=` > localStorage `sanpo.quality.v1` > 첫 표시 뒤 스트리밍이 2 s 조용해지면 `render.detectQuality()`, `quality/changed`마다 저장. 골든뷰는 고정·동적 해상도 끔(M03-T08). 반환 `{ settled, off }` — settled = 첫 티어 결정 끝(e2e 안정 조건) |
| src/debug/physics-probe.ts | `?probe=physics`(+`&physicsIsolation=degraded`): 렌더 없이 물리 워커 + 상자 낙하 3 s → `__SANPO_PHYSICS_PROBE__`, `#app[data-probe]`(e2e physics.spec.ts, M04-T01) |
| src/debug/post-flags.ts | `?quality=low\|medium\|high\|ultra`, `?post=ao:gtao,ssr:0,scale:0.85,…` → RenderConfig.quality·post(M03-T07 A/B). `?dynres=0` 동적 해상도 끔, `?gpuLoad=n` 디버그 GPU 부하(M03-T08), `?forcePost=1` 소프트웨어 래스터에서도 후처리(정지 떨림 e2e, ADR-0038). `?post=aerial:full|half,exp:<n>`(ADR-0039·0040) |
| src/weather-mode.ts | M09-T01 날씨 모드: `?weather=auto\|live\|<상태 id>` > 골든뷰 weather > `?time=`(맑음 고정) > auto, `applyWeatherSpec`, live = `/api/weather` 10분 폴링(`startLiveWeather` — 크레딧 Open-Meteo 줄 `credits.setLiveCredit`) |
| src/debug/wet-override.ts | `?wet=0..1` → `WeatherOverride`(env 배선·태양 고정이 `weather.wetness`를 덮음) + 왼쪽 아래 슬라이더(골든뷰 제외) — M03-T06 젖음 수동 검증 |
| src/three-compat.ts | Vite alias `three` 대상: `three/webgpu` + WebGL 전용 이름 2개 대체(ADR-0028) |
| src/debug/bookmarks.ts | 골든뷰 북마크(M03-T10): `?view=<id>` → `tests/golden/views.json` 동적 import(별도 청크) → 시작 포즈(절대 또는 지면 + AGL)·부팅 대기 중심·fov, `createGoldenWatch`(스트리밍 큐 0·HLOD 페이드 0·`extra` 1.5 s → `#app[data-golden=ready]`), `__SANPO_GOLDEN__` |

## Invariants
- 새 기능은 패키지에 구현하고 여기서는 배선만 추가.
- 각 wiring 파일 ≤ 200줄. 배선 로직이 커지면 해당 패키지 API가 부족하다는 신호 → 패키지 쪽 보강.

## Tests
test/caps.test.ts(WebGPU 3상태·격리·워커 수), test/boot.test.ts(루프·훅, 월드 상태 분류, 상태 문구, 플래그), test/world-load.test.ts(커밋된 world-mini를 가짜 fetch로: 4셀 로드, SPA 폴백·원점·포맷·크기 불일치 거부, `?world=mini`는 API 미호출),
test/start-view.test.ts(시작 시점 = 지면 + 60 m·Scramble Square 조준), test/walk-physics.test.ts(실제 Jolt 같은 스레드 + traversal walk: 연석 0.15 m·계단 0.18 m 카메라 프레임당 < 3 cm), test/streaming-render.test.ts(적용 순서·바이트 예산·해제 순서·적용 전 해제·L3), test/overlay.test.ts(오버레이 문구), test/bookmarks.test.ts(뷰 조회·AGL 포즈·안정 판정).
골든뷰(`pnpm golden`, 실제 GPU, CI 제외): `tests/golden/golden.spec.ts` — README 참조. 역 동선(`pnpm stations`, 실제 GPU, CI 제외): `tests/golden/stations.spec.ts`(모든 출구 계단 F 도착 = 승강장 윗면·여유·구덩이 아님·올라가기 거리).
test/headers.test.ts(`public/_headers` Referrer·Permissions-Policy, HSTS 없음 — ADR-0102), test/station.test.ts(개찰구 배치·통과·플랩·계단 닿음), test/platform-geo.test.ts(윗면 높이·여유·안전 도착·구덩이/승강장 밑), test/landing.test.ts(지면·지붕·선로·차도·경사·승강장(차양 아래)·가장자리·건물 안·머리 공간·링 대체·차선 폭).
E2E(Playwright, `pnpm test:e2e` — 빌드 + vite preview, Chromium은 `--enable-unsafe-swiftshader`, 로컬 다른 Chromium은 `PW_CHROMIUM_PATH`):
`tests/e2e/boot.spec.ts`(`?world=mini` → `data-world=loaded`·셀 4·격리·콘솔 오류 없음),
`tests/e2e/render.spec.ts`(`?world=mini&debug=1&backend=webgl` → 셀 4 렌더, 중앙 타워·하단 건물 픽셀 비율, O 테스트 전후 픽셀 차 0; 스크린샷 `test-results/screenshots/` → CI 아티팩트 `e2e-screenshots`).
`tests/e2e/decode.spec.ts`(`?world=mini&probe=decode` → 4셀 정점·인덱스 수 = 파이프라인 스냅샷, 2차 Cache Storage, 취소, 긴 작업 0, 셀당 시간 첨부 `decode-probe.json`),
`tests/e2e/physics.spec.ts`(물리 워커 shared·degraded 낙하, world-mini 셀 콜라이더·레이), `tests/e2e/walk.spec.ts`(C → 지면 착지·눈높이, W 물리 속도 1.35 m/s·발 = 지면, V 3인칭 거리, C 왕복 = 바디 유지).

## Status
M00-T04 부트 골격: 기능 감지 표시 + 빈 스케줄러 루프 + `/api/world/current` 조회 + `?debug=1` stats-gl. M01-T07: 4단계 데이터 로드 + `?world=mini`. M01-T06: render·input·traversal(freecam) 조립, 디버그 오버레이.
M02-T05: streaming(6단계)·streaming→render 배선(9단계 일부)·whenReady·precompile(10단계 일부), 임시 셀 로더 삭제, `?world=local`. 나머지 5·9–11단계는 각 패키지 태스크에서.
M04-T01–T03: physics(월드 로드 뒤 스폰 앵커로 생성)·streaming→physics 배선, traversal 컨텍스트 `physics` = getter(월드 로드 뒤 walk 가능). 시작은 freecam, C = 걷기(ADR-0043) → M05 결정 1: 시작 = walk, freecam은 C·`?mode=freecam`·골든뷰(ADR-0047).
