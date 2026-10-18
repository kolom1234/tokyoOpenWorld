# @sanpo/ui
Layer: L4 | Depends: core, preact 10.29.8, @preact/signals 2.11.2, idb-keyval 6.3.0 | Used by: apps/game

## Purpose
DOM 오버레이 UI 전부(부팅·타이틀·HUD·지도·도감·포토모드·설정·크레딧), i18n(ko·ja·en), 메뉴 내비게이션(키보드·마우스·게임패드). 게임 상태는 `UiBridge`로만 접근.
상세: `docs/12-ui-ux.md` (UiBridge §7), ADR-0091.

## Public API
```ts
mountUi(root, bridge: UiBridge, opts?: UiOptions { menus; initial?: ScreenId[] }): UiHandle { screen: ReadonlySignal<ScreenId>; open(s); close(); toggleHelp(); dispose() }
UiBridge { hud: ReadonlySignal<HudModel>; loading: ReadonlySignal<LoadingModel>; discoveries; places: ReadonlySignal<TravelPlace[]>; settings: Signal<SettingsModel>; map: MapSource { state; minZoom; maxZoom; load(); tile(z,x,y): Promise<MapTileData|null> };
           hasSave: ReadonlySignal<boolean>; startPoints: {id, name: LocalName}[]; credits(): Promise<CreditsModel>; worldToMap(posWF); commands: UiCommands }
UiCommands { pause(on); start(StartChoice {continue | new at}); fastTravel(id); setTime(ms); setWeather(mode, preset?); takePhoto(scale 1|2): Promise<Blob>; setPhotoParams(p|null); exportSave(); importSave(f) }
ScreenId = boot|title|hud|pause|settings|credits|map|log|photo;  LoadingModel { stage caps|manifest|shaders|spawn|ready|error; progress; detail: Msg|null; webgpu; isolated; error }
HudModel { mode; place: LocalName|null; timeMs; weather; tempC; prompt: Msg|null; notice; noticeSeq; guide: GuideModel|null; drive: DriveModel|null; train: TrainModel|null; groundLoading; fade 0..1; posWF; yawRad; gamepad }
Msg { key; params?: Record<string, string|number|LocalName> }  // 안내 글의 {kInteract}·{kSummon}·{kLand}는 UI가 지금 바인딩(패드면 패드 글자)으로 채운다
GuideModel { kind gate|stairs|platformExit; station; exit: LocalName; distanceM; arrowDeg }
SettingsModel { v 1; lang; quality auto|tier; fovDeg 50–100; headBob; reduceMotion; lookSensitivity 0.25–3; invertY; volume {master 0–1.5, ambience, sfx, vehicle, train, ui}; muted; hudFade; units; minimapRotate; uiScale 0.8–1.5; showHelp; keys: Partial<Record<RebindAction, code>> }
RebindAction = interact|toggleView|freeCam|sprint|pace|summon|summonBike|land|lights|skip|map|photo;  LANGS, REBIND_ACTIONS
DEFAULT_SETTINGS, normalizeSettings(raw, fallbackLang), langFromNavigator(langs), DEFAULT_KEYS, keyLabel(code), createMockBridge(opts) (샌드박스·테스트)
재수출: signal, computed, effect, batch, Signal, ReadonlySignal(@preact/signals — 게임이 같은 인스턴스로 브리지를 만든다)
```

## Invariants
- 다른 @sanpo 패키지(core 제외) import 금지.
- HUD 갱신 ≤ 10 Hz(게임 브리지가 시그널을 0.1 s마다, 바뀐 값만). 매 프레임 DOM 변경 금지.
- 모든 문자열은 i18n 키(하드코딩 금지), ko/ja/en 키 집합·치환 자리 동일(테스트). 고유명사는 LocalName(데이터).
- 메뉴 화면(`.screen[data-menu]`)은 열릴 때 첫 컨트롤(data-autofocus) 포커스, 모든 컨트롤 data-nav — 키보드·패드로 전부 닿는다.
- 맨 위 화면이 HUD가 아니면 `commands.pause(true)`.
- 출처 표기(지도 하단, 크레딧) 제거 금지.

## Files
api.ts, index.ts, internal/(app — 화면 스택·mountUi, settings — 기본값·정규화, keys — 키 이름·재바인딩 맞바꿈, theme — CSS 문자열, i18n/(ko·ja·en.json, t.ts), nav/(focus — 공간 이동 순수, pad — 메뉴 패드 엣지·반복, nav — DOM 드라이버),
components/controls(버튼·선택·슬라이더·켬끔), screens/(boot, menus — 타이틀·일시정지, settings, credits, hud — 도움말·안내·알림·막, hud-info — 지명·시각·날씨·기온·계기·다음 역·무입력 5 s 흐림, help — 모드별 줄), sandbox/mock-bridge).
map/(view — 메르카토르 ↔ 화면·회전 순수, styles, tile-cache — 512 px 래스터·LRU 96·pump 예산, canvas-renderer — 타일·부모 대체·라벨 겹침 제거·표식·화살표, minimap — 원형 200 px·HUD 갱신 때만, controller — 전체 지도 팬·줌 루프), screens/map(빠른 이동 목록·레이어·출처 상시), screens/log(도감 — 분류 탭·격자·상세·사진 칸, M10-T04).
예정: screens/photo, save/(store, migrations).

## Tests
test/shell.test.ts: i18n 키·치환 자리 동등성·라벨 누락, 공간 이동, 패드 엣지·반복·열 때 눌린 Start 무시, 화면 스택, 키 재바인딩(맞바꿈·고정 키 거부), 설정 정규화·브라우저 언어, 도움말 줄(모드·재바인딩·패드).

## Status
M10-T01 셸(ADR-0091): 부팅·타이틀(새 산책 시작 지점)·일시정지·설정(그래픽·카메라·모션·조작·소리·일반)·크레딧(ATTRIBUTION 최소)·HUD(도움말·역 안내·안내·알림·지면 대기·막), `?ui-sandbox=1`. T02 HUD 지명(e-Stat, ADR-0092)·시각·날씨·기온·탈것 계기·열차 다음 역·흐림. → T03 지도, T04 도감, T05 포토, T06 세이브·크레딧 자동.
