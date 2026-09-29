# ADR-0029: 태양 그림자(CSM)·월드 시계·환경 배선 (M03-T03)
- Status: Accepted
- Date: 2026-09-29

## Context
07 §6: 태양 = CSM(High 4 × 2048², 600 m), 방향은 sim이 suncalc + 수렴각으로 계산해 `EnvironmentState.sunDirWF`로 전달. 10 §2: 시계 realtime/custom/frozen.
T02에서 대기 라이트(takram `AtmosphereLight` = DirectionalLight)가 들어왔다.

## Decision
1. **sim(M03 최소)**: `createSim({bus, log, initialClock})` → `clock`(WorldClock: realtime·custom·frozen, 04:00 JST 운행일 요일 — 공휴일 표는 M06) + `environment()`.
   천문 = suncalc 2.0.2(도, 진북 시계방향, 겉보기 고도) → `trueToGridAzimuthDeg`(수렴각) → WF 벡터. 관측 위치 = 카메라, **1 km 격자로 스냅**해 계산·캐시
   (스냅 없이 "1 km 안이면 재사용"하면 결과가 캐시를 채운 위치에 따라 1 LSB씩 달라져 원점 재설정 e2e가 깨졌다).
2. **기본 시계** = 오늘 12:00 JST부터 1배속(`wiring/env.ts defaultClock`) — 설정 UI(M08) 전까지. realtime 기본은 밤에 부팅하면 화면이 어둡다(야간 광원 M09).
   `?time=<ISO>`·골든뷰 `time` = frozen.
3. **배선**: `wiring/env.ts` phase 66(camera 65 뒤, renderPrep 70 앞) `render.setEnvironment(sim.environment())`. `frameSource.gameTimeMs/timeScale` = sim 시계.
   `?sun=` 디버그(phase 68)가 뒤에서 덮어쓴다.
4. **그림자**: `renderer.shadowMap.enabled = true`(없으면 AnalyticLightNode가 그림자를 건너뛴다 — 한참 헤맴) + takram `CascadedShadowMapsNode`(three CSMShadowNode 확장,
   takram 그림자 예제와 같은 구성) 4 캐스케이드 × 2048², maxFar 600 m, practical, **fade**(캐스케이드 경계 이음새 제거), lightMargin 400 m(초고층 그림자).
   bias −0.0002·normalBias 0.05. cast = buildings·overrides, receive = HLOD 제외 전부. WebGPU만(WebGL2는 T09). `RenderConfig.shadows`·`?shadows=0`.
5. **하늘 배경은 WebGL2 경로만**: WebGPU는 aerialPerspective가 깊이 1 텍셀에 하늘을 그린다. 환경 프로브와 `scene.backgroundNode`를 같이 쓰면
   배경 머티리얼이 **매 프레임 재빌드**(CPU ≈ 20 ms, 30 FPS 고정 — 프로파일 실측). WebGL2 = 배경 + 라이트 간접, 환경 프로브 없음.
6. **GPU 타이머 정정**: three r186 `resolveTimestampsAsync()` 반환값은 "마지막 info.frame"만 합산 → RenderPipeline에서는 후처리 쿼드(≈ 0.1 ms)만 잡힌다.
   풀의 `timestamps`(해석 묶음 전 패스)를 합산하도록 수정 — vsync·프레임 제한을 끈 Chrome의 프레임 시간과 일치(21.2 vs 21.3 ms). T02에 기록한 4.5–6.4 ms는 틀린 값.

## Consequences
- 수락: 2026-06-21 시부야 남중 11:43 JST 고도 **77.782°**·진북 방위 180.05°, 12:00 JST 77.237°(`packages/sim/test/clock.test.ts`).
- 1440p GPU 프레임(RTX 3050 Laptop): 18.9–23.6 ms(그림자 +1–2.5 ms). 07 §10 예산(RTX 3060 ≤ 12 ms, 이 GPU의 ≈ 2.2배 성능)에 빠듯 →
  동적 해상도(T08)·후처리 정리(T07). 패스 분해: 씬 ≈ 12–17 ms, 공중원근 쿼드 ≈ 5–10 ms, 그림자 캐스케이드 각 0.1–0.2 ms.
