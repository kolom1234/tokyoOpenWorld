# ADR-0094: 도감 — Wikidata 이름·좌표(CC0) + 자체 작성 설명 + 위키백과 겹침 검수
- Status: Accepted (M10-T04)
- Date: 2026-10-18

## Context
- M10-T04: Wikidata 이름·좌표 추출 스크립트, 자체 설명 3개 언어, 발견 판정, 도감 화면. 수락 = 20곳 모두 발견 가능, 설명 텍스트 출처 = 자체 작성(검수 체크). 규칙: 위키백과 등 문장 복사 금지, 실존 상호 홍보 문구 금지.
- 10 §7: 반경 안 2 s 체류(자유비행 제외) → 발견. roadmap은 `content/poi/*.yaml`.

## Decision
1. **명소 20곳**(거리 6·공원 4·신사 5·랜드마크 4·전망 1 — 상업 시설·전망대 상호는 피함)을 `content/poi/pois.json`(YAML 대신 JSON — 의존성 없이 게임 번들·파이프라인이 같이 읽음)에: Wikidata Q-id, 종류, 발견 반경, 이름 규칙, 설명 ko·ja·en, `descriptionSource: original`.
2. **이름·좌표 = Wikidata**(`pnpm pipeline poi-wikidata` → `content/poi/wikidata.json`, CC0, User-Agent = 저장소 주소만): 이름 규칙 `label`(라벨) | `alias:<s>`(그 언어 Wikidata 별칭 — 괄호 설명은 지움, 예: 旧渋谷川遊歩道路 → キャットストリート) | `derived:<s>`(ko 라벨이 없을 때만 일본어 이름을 우리가 옮겨 적음 — 10곳 ⚠️). 좌표 P625 → `lonLatToWF`.
3. **설명 검수**(`pnpm pipeline poi-review` → `content/poi/review.json`): 사이트링크로 ja·en·ko 위키백과 본문을 받아 정규화 뒤 최장 공통 부분 문자열(ja·ko ≤ 16자, en ≤ 45자 — 고유명사·연도는 허용, 문장 복사는 걸림)과 n-gram 공유율(ja·ko 글자 8개, en 단어 4개 ≤ 20 %), 홍보 문구 목록(최고·必見·must-see…) 검사. 결과에 설명 sha256 — 단위 테스트(오프라인, CI)가 지금 글과 sha·통과 여부·상한·홍보 0·형식·이름 규칙·좌표가 MVP 영역 안을 검사(설명을 고치고 검수를 다시 안 돌리면 실패).
4. **발견 판정** = `@sanpo/sim` `createPoiService(pois)`(메인 순수 상태): 반경 안 연속 2 s(나가면 초기화), mode freecam·idle 제외(걷기·탈것·열차는 셈), 한 번만, `restore(ids)`. 게임(`shell/pois.ts`)이 발견 기록(게임 시각·날씨·사진 id)·알림·지도 빠른 이동 대상(`poi:<id>`, 착지 반경 120 m — 좌표가 건물 안일 수 있어 walk 착지가 거리로 비킨다) 추가.
5. **도감 화면**(일시정지 메뉴 → 도감): 분류 탭 6개, 격자(미발견 = ???·지도에 회색 점), 상세(이름·자체 설명·발견 시각 JST·날씨·사진 — 사진은 T05). 키보드·패드 = 탭·격자 공간 이동.

## Consequences
- 검수 결과(2026-10-18): 60개 모두 통과, 위키백과와 대조 46개(없는 언어판 14개는 비교 대상 없음 — 번역 복사는 이 방법으로 못 잡는다 ⚠️), 최장 공통 문자열 최대 ja·ko 8자·en 34자(고유명사 "metropolitan government building"), n-gram 최대 2.4 %.
- 데이터는 게임 번들(JSON import, 수 KB) — 셀 meta `pois`·`global/poi-index.json`(10 §7)은 쓰지 않는다(빌드 없이 내용 수정 가능). 셀 meta 스키마의 `pois`는 빈 배열 그대로.
- "20곳 모두 발견 가능" 실제 확인 = MVP 빌드에서 실제 GPU 봇이 명소마다 빠른 이동 → 2 s 체류 → 발견(PR 기록).
