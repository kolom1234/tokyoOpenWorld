# ADR-0084: 역 가상 안내판 + 근접 HUD 안내 + URL 스폰 프리셋(M10 지도 전 임시)
- Status: Accepted (M09·M07 사람 확인 후속)
- Date: 2026-10-13

## Context
staging 확인: 개찰구가 어디 있는지 찾을 수 없다. 개찰구·계단 표식은 글자 없는 상자(ADR-0081)였고, 지도(M10)·HUD(M08)는 아직 없다.
확인할 장소(하라주쿠 개찰구·승강장, 스크램블, 신주쿠 서쪽 등)로 가려면 시부야 스폰에서 수 km를 날아가야 했다.

## Decision
1. **안내판**(render `StationFixtures.signs: StationSign[]` → `stations/signs.ts`): 판마다 1024×256 칸 OffscreenCanvas 아틀라스 1장 + 앞뒤 사각형 묶음 메시 1개(머티리얼 1개, 조명 없는 발광면).
   **가상 디자인** — 남색 판·주황 그림 기호(개찰구·계단·출구·역: 단순 도형)·주황 밑줄·시스템 sans-serif. 실제 JR 로고·서체·노선색 띠·역명판 양식 복제 없음.
   출구마다 4장(game `station/layout.ts`): 개찰구 위(기둥 둘, "改札 Ticket Gates · 개찰구" + 역·출구 이름), 거리 쪽 7 m 역 이름 기둥, 개찰구 안 계단 표식("ホーム Platforms · F"), 승강장 출구 계단 표식("出口 Exit · 출구 이름 · F").
2. **근접 안내**(`station/guide.ts` + `hud.ts guide` — 화면 위 가운데 임시 DOM, M08 대체): walk 중 0.2 s마다 가장 가까운 것 하나 —
   승강장 밖: 개찰구 80 m 안 "개찰구 ↗ 32 m — 역·출구", 개찰구를 지나 계단 15 m 안 "계단 ↑ 6 m — F로 승강장"; 승강장 윗면 위: 표식 60 m 안 "출구 계단 ← 20 m — F로 출구".
   화살표 = 카메라 시선 기준 8방위. 거리·승강장 높이 차가 1.6–2.2 m뿐이라 높이 대신 "발이 승강장 윗면 위"로 가른다.
3. **스폰 프리셋**(`content/spawn-presets.json`, `?spawn=<id>`, game `spawn-presets.ts`): boot가 LoadedWorld 스폰(위치·방위·3×3 셀)을 바꿔 showWorld에 넘긴다 → 부팅 대기 중심·물리 앵커·첫 walk 착지가 그 자리.
   로딩 중 freecam 시점도 프리셋 위 30 m(스트리밍 관심점이 처음부터 스폰 둘레 — 기본 시점(스크램블)에 두면 스폰 셀이 ready에서 live가 안 됨). `surface: 'platform'` = 철도 적재 1 s 뒤 승강장 윗면 안전 자리로.
   골든뷰(`?view=`)가 있으면 무시. 목록: harajuku-gate, harajuku-platform, shibuya-scramble, shibuya-hachiko-gate, shinjuku-west, yoyogi-west, omotesando, yoyogi-park(docs/12 §임시 안내).
4. 함께 고친 것: walk 착지 탐색 중 플레이어(물리 셀 반경·관심점) = 도착 기준점(전에는 원점·옛 바디 → 먼 스폰에서 착지 레이가 영영 빗나감).

## Consequences
- 출구는 역마다 1곳(가상 배치) — 실제 출구 수·위치와 다르다. 안내판 글은 한·일·영 혼합 고정(언어 설정은 M08 i18n).
- 안내판은 그림자·조명 없음, 원거리 LOD 없음(16장 — 비용 무시 가능).
