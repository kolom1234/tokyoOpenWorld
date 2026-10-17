# ADR-0090: 탈것 소리 — 엔진 AudioWorklet 합성 + 타이어·젖은 노면·바람·자전거(전부 합성)
- Status: Accepted (M08-T04)
- Date: 2026-10-17

## Context
- 11 §1 vehicleBus: "엔진음 합성(AudioWorklet 그라뉼러/RPM 기반), 타이어·바람 노이즈". M08-T04: RPM·변속·노면(젖음)·타이어, 자전거 체인·벨. 수락 = 변속 시 RPM 음 변화 자연스러움(리뷰), 오디오 스레드 언더런 0.
- 녹음은 CC0·CC BY만 허용, 특정 실제 차종 소리 재현 금지. M09-T04 엔진 자리(톱니 오실레이터 + 잡음)만 있었다.
- CSP `script-src 'self'` — 워클릿 모듈을 blob:·data: URL로 올릴 수 없다.

## Decision
1. **녹음 없이 전부 합성**(라이선스·실제 차종 문제 없음). 그라뉼러(녹음 조각)는 쓰지 않는다.
2. 엔진 = `synth/engine-worklet.js`(AudioWorkletProcessor `sanpo-engine`, 가상 직렬 4기통): 점화 주파수 rpm/30마다 짧은 감쇠 펄스(잡음 거칠기) → 저역 쿵 + 배기 공명 2개(rpm 따라 이동) + 흡기 잡음(부하·rpm), 실린더별 세기 표(±4 %), 부드러운 포화.
   입력 = k-rate AudioParam rpm·load·level — 메인이 setTargetAtTime(τ 30·50·120 ms)으로 보내 변속 때 물리 RPM 낙하가 그대로 들린다(변속 중 부하 0.05 + 낮은 "덜컥").
   일반 .js 파일(같은 코드가 Node 테스트에서 `EngineSynth`로 돈다) — Vite가 `new URL('./engine-worklet.js', import.meta.url)`을 같은 출처 에셋으로 내보낸다(`assetsInlineLimit`에서 .js 인라인 금지). 불가하면 톱니 오실레이터 대체.
3. 노면: 타이어 구름(대역 잡음 — 속력·재질(타일·콘크리트 높게)), 젖은 노면 쉭(고역 잡음 — 젖음 × 속력), 미끄럼 끽(좁은 대역 — 바퀴 슬립 비·횡 슬립각 정규화, 젖으면 ¼), 바람(속력²), 운전석 시점 = 실내 저역 통과 1.5 kHz·바람 0.4배.
4. 자전거: 엔진 없음, 페달 = 체인 사각거림, 타력 = 프리휠 딸깍(펄스 주기파, 바퀴 회전 × 18), 벨 = SfxId `bicycleBell`(비화성 두 부분음 두 번 — 일반 종소리) 핸들 높이 3D.
   워클릿은 unlock 직후(소리 나기 전) 적재·노드 생성 — Chrome이 첫 AudioWorkletNode 때 렌더링을 워클릿 스레드로 옮기며 한 번 끊겼다(운전 시작 때 결손 1, 실측). AudioContext latencyHint 'balanced'.
5. 언더런 측정 = `OutputClock`: 1 s마다 `getOutputTimestamp()` 컨텍스트 시각 증가가 성능 시각보다 20 ms 넘게 뒤처지면 결손 1(`stats().clockGlitches`). 실제 GPU 주행 봇이 0을 확인한다.

## Consequences
- 합성기 비용(Node): 10 s 분량 ≈ 8 ms(실시간의 0.08 %) — 렌더 스레드 여유 큼. 메인 스레드는 프레임마다 setTargetAtTime 15개.
- ⚠️ 음색은 단순 모델 — 변속·회전 상승은 자연스럽게 따라가지만 실제 녹음 수준의 질감(밸브·흡기 공명 세부)은 없다. 사람 귀 리뷰 필요(PR 안내).
- 다른 차(교통 NPC) 엔진음은 범위 밖(앰비언스 베드의 차량 흐름 녹음이 대신).
