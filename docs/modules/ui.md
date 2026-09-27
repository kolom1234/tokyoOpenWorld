# @sanpo/ui
Layer: L4 | Depends: core, preact, @preact/signals, pmtiles | Used by: apps/game

## Purpose
DOM 오버레이 UI 전부(부팅·타이틀·HUD·지도·도감·포토모드·설정·크레딧), i18n, 세이브 직렬화. 게임 상태는 `UiBridge`로만 접근.
상세: `docs/12-ui-ux.md` (UiBridge §7).

## Public API
`mountUi(root, bridge) → unmount`, 타입 `UiBridge, HudModel, LoadingModel, DiscoveryModel, SettingsModel, PhotoParams`.

## Invariants
- 다른 @sanpo 패키지(core 제외) import 금지.
- HUD 갱신 ≤ 10 Hz. 매 프레임 DOM 변경 금지.
- 모든 문자열은 i18n 키(하드코딩 금지), ko/ja/en 키 집합 동일(테스트).
- 출처 표기(지도 하단, 크레딧) 제거 금지.

## Files
app.tsx, screens/(boot, title, hud, map, discovery, photo, settings, credits, pause), map/(pmtiles-source, canvas-renderer, styles, minimap, fullmap), i18n/(ko.json, ja.json, en.json, t.ts), save/(store, migrations), theme.css.

## Tests
i18n 키 동등성, 세이브 마이그레이션, 지도 좌표 변환(목 브리지).

## Status
미구현 (M10, 셸은 M00 이후 병렬 가능).
