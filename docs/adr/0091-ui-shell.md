# ADR-0091: UI 셸 — Preact 화면 스택, 메뉴 모드, 일시정지, 설정 저장, 임시 HUD 흡수
- Status: Accepted (M10-T01)
- Date: 2026-10-18

## Context
- 12 §1·§2·§7: Preact + signals, 화면(Boot/Title/Pause/Settings/Credits/HUD…), 3개 언어, `UiBridge`로만 게임 상태. M10 규칙: 모든 화면 키보드·마우스·게임패드, 흩어진 임시 기능(조작 도움말 H·역 근접 안내·`?spawn=`·볼륨 키·품질)을 정식 UI로, URL 옵션(`?spawn=`·`?debug=1` 등)은 개발·테스트용으로 유지.
- e2e·골든·봇은 로딩 뒤 바로 걷는다(타이틀 메뉴에 막히면 안 된다). 품질 티어는 render 생성 전에 알아야 한다(동기).

## Decision
1. **화면 스택**(`app.tsx nextStack`): `boot` → (메뉴 모드) `title` | (개발 모드) `hud`. HUD 위에 `pause`·`settings`·`credits`·(T03–T05) `map`·`log`·`photo`. 맨 위가 HUD가 아니면 `bridge.commands.pause(true)`.
2. **메뉴 모드**(`shell/options.ts`): 기본 켬. `?debug=1`·`?view=`·`?spawn=`·`?mode=`·`?probe=`이면 끔(곧바로 HUD — 기존 테스트 경로 그대로), `?title=1|0`로 강제. 메뉴 모드에서만 포인터 잠금 풀림(잠금 중 Esc는 페이지에 오지 않는다·창 전환) = 일시정지 메뉴.
3. **일시정지** = `input.setEnabled(false)`(액션 전부 0 — 컨텍스트 전환은 그대로 받으므로 모드 진입이 덮어쓰지 않는다) + 포인터 잠금 해제 + 사용자 시계(custom)면 frozen. 물리·군중·교통은 계속(탈것은 입력 0으로 굴러 멈춤 ⚠️). 재개 버튼(클릭·Enter = 제스처)이 포인터 잠금을 다시 요청.
4. **내비게이션**(`nav/`): 화살표 = 공간 포커스 이동(순수 `pickNext`), ←→ = 조절 컨트롤(data-nav-adjust → navadjust), Esc·Backspace = 뒤로, `[`·`]` = 설정 탭. 패드(메뉴 열린 동안만 rAF 폴링): D-pad·L스틱(0.35 s 뒤 0.12 s 반복), A 선택·B 뒤로·Start·LB/RB 탭 — 메뉴를 연 버튼이 눌린 채면 무시. 게임 쪽 Start(패드 9) = `pause` 바인딩. 긴 목록(크레딧)은 그쪽에 컨트롤이 없으면 굴린다.
5. **설정 = localStorage `sanpo.settings.v1`**(12 §4의 IndexedDB `settings/v1` 대신): 부팅 때 동기로 읽어 render 티어(`?quality=` > 설정 티어 > 감지 저장값)와 첫 화면 언어(없으면 브라우저 언어)를 적용. 세이브 내보내기에 함께 담는다(T06). 정규화(`normalizeSettings`)가 범위·형식을 고친다.
   적용: 품질 `render.setQuality`, FOV·감도·헤드밥·모션 효과 `traversal.configure`(신규 — 같은 settings 객체 제자리 갱신), 시선 반전 `input.setAxisScale('lookY', −1)`(신규), 키 재바인딩 `input.setBindings`(기본 바인딩의 키보드 키만 교체·패드 유지 — 신규), 볼륨 `audio.setMix`(음소거 = master 0).
   재바인딩 대상 = 버튼 액션 12개(이동 WASD·E/Q·H·Esc·Enter·화살표는 고정 — 겹치면 거부, 다른 액션이 쓰던 키면 서로 맞바꿈).
6. **모션 민감**: 헤드밥 끔 + `TraversalSettings.motionEffects=false`(추적 카메라 속도 FOV +5° 끔·열차 미세 진동 끔).
7. **임시 HUD 흡수**: `help-hud.ts`(조작 도움말) → UI HUD 도움말(모드별 [키, 동작], 재바인딩·패드 반영, H는 UI가 접기 — 설정 "도움말 보이기"), `station/hud.ts`의 문자열 DOM → `shell/hud-state.ts`(번역 키 Msg·안내 칸 우선순위 landing > station > vehicle·알림 seq·역 안내 구조 `GuideModel`), `ground-loading.ts` → HUD `groundLoading`(0.2 s 넘을 때). id(`#station-prompt`·`#sanpo-notice`·`#station-guide`·`#station-fade`·`#sanpo-help`)는 유지. 안내 글의 키 글자는 UI가 채운다(`{kInteract}` 등 — 재바인딩·패드).
   볼륨 키 `[ ] \`는 `?debug=1`에서만(개발 단축키, 저장 안 함 — e2e audio). 차내 LCD(train-lcd)는 세계 속 표시라 그대로(자체 3개 언어 순환), 운전 계기판은 T02에서 HUD로.
8. **로딩 화면**: StatusView(e2e `#app[data-*]`)는 그대로 두고 화면에서 숨김, 같은 호출을 `LoadingModel` 시그널로(`shell/loading.ts`) — 단계 caps → manifest → shaders(대기 LUT·셰이더 n/N·아바타) → spawn(셀 n/N) → ready, 오류 원문 표시.
9. **새 산책 시작 지점** = 스폰 프리셋 3곳(시부야 스크램블·하라주쿠 다케시타 출구·신주쿠 서쪽 출구) → 빠른 이동(`shell/fast-travel.ts`): 검은 막 → `traversal.request('walk', 먼 기준점)`(ADR-0084 착지 경로 — 콜라이더 적재 뒤 하늘 레이) → 착지(목표 12 m 안·정지·지면 대기 아님 3번 연속) → 스트리밍 조용(최대 8 s) → 막 걷기. surface `exact` = 착지 뒤 물리 레이로 처마 밑 바닥, `platform` 프리셋은 빠른 이동 대상 아님.
10. **스타일** = `theme.ts` 문자열 → `<style>`(번들러 CSS 경로 없이 샌드박스·게임 공통), UI 배율 `--ui-scale`. `?ui-sandbox=1&screen=&lang=&pad=1` = 목 브리지 스토리 페이지(스크린샷·리뷰).

## Consequences
- 공개 API: input `setBindings·setAxisScale·setEnabled·enabled`, traversal `configure()`·`TraversalSettings.motionEffects`, ui `UiBridge`·`mountUi(root, bridge, opts) → UiHandle`·시그널 재수출(게임이 같은 인스턴스로 브리지를 만든다).
- ⚠️ 폰트: Noto Sans JP/KR 서브셋 자체 호스팅(12 §1)은 미적용 — 시스템 일·한 고딕(Yu Gothic UI·Malgun Gothic·Hiragino) 스택. 대안: 파이프라인에서 UI 문자열·지명 글리프로 서브셋(woff2) 생성.
- ⚠️ 일시정지 중 물리·군중은 계속 돈다(완전 정지는 물리 워커 일시정지 API 필요).
- 검사 도구(check-size·codemap)는 .tsx를 TSX로 파싱하도록 고쳤다(전에는 JSX를 TS로 읽어 함수 길이를 잘못 셌다).
