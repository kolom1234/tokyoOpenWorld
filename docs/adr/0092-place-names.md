# ADR-0092: HUD 지명 — e-Stat 소지역 + 우편번호 가나로 3개 언어, 셀 meta placeNames
- Status: Accepted (M10-T02)
- Date: 2026-10-18

## Context
- 12 §2 HUD 왼쪽 위 "○○区 ○○町 ○丁目"(e-Stat 경계), M10-T02 수락 = 경계 이동 시 지명 갱신 ≤ 0.5 s, HUD 10 Hz. UI는 ko·ja·en.
- e-Stat 소지역 경계에는 일본어 이름만 있다(읽기·로마자 없음). OSM 지명 번역은 町丁 단위로 빈 곳이 많다.

## Decision
1. 경계 = e-Stat 2020 국세조사 소지역(町丁・字等) Shapefile, JGD2011 경위도, MVP에 걸치는 구 6곳(港·新宿·目黒·世田谷·渋谷·中野). HCODE 8101만(8154 수면 제외). 원천 zip sha256을 lock에(구별 객체).
2. 읽기 = 일본우편 우편번호 데이터 KEN_ALL(도쿄도, 읽기 소문자판) 町域 가나 — 일본우편은 이 데이터에 한해 저작권을 주장하지 않는다(다운로드 페이지). 町丁 이름(괄호 설명 제거·이체자 ケ/ヶ·鶯/鴬·濤/涛 통일)으로 맞춘다.
3. 표기: ja = 「渋谷区 道玄坂二丁目」(丁目은 한자 숫자), en = 헵번식(장음 생략, 어두 オオ만 장음 — 広尾 Hiroo)「Dogenzaka 2-chome, Shibuya」, ko = 일본어 표기법(어두 예사소리·어중 거센소리·장음 생략·ン ㄴ·ッ ㅅ)「시부야구 도겐자카 2초메」. 자동 변환 — MVP 133개 町丁 읽기 누락 0.
4. 파이프라인 `normalize --layer areas`(Node만): shp·dbf 리더 자체 구현(GDAL 불필요) → 바깥 링 WF·Douglas–Peucker 1.5 m → places.json. build가 셀 사각형과 bbox가 겹치는 링 전체를 셀 meta `placeNames`(셀 로컬, 이웃 셀 중복)로 — 셀 한 장으로 조회 가능, meta.json sources += estat-small-area·japanpost-kenall.
5. 게임: live L0 셀이 붙을 때 `requestSections(meta.json)`(구독 전 셀은 발밑 셀 보충) → WF 폴리곤 색인, HUD 10 Hz마다 점-폴리곤(포함 중 최소 면적 — 안쪽 町·飛び地), 1 m 안 이동이면 앞 결과. 해제 셀은 버린다.

## Consequences
- 실제 GPU(테스트 빌드 6셀): 순간이동 뒤 지명 바뀜 32–77 ms(≤ 0.5 s ✅). HUD 시그널 갱신 ≤ 10 Hz(0.1 s 묶음, 바뀐 값만 — 걷기 중 3.2 Hz).
- 로마자는 붙여 쓴다(Jingumae·Udagawacho — 표지 관례). 2026-10-19: 방위 접두(東西南北 + 두 글자 이상)는 하이픈으로 뗀다(`names.ts townRomaji` — Nishi-Shinjuku·Minami-Aoyama). 셀 meta에 구워지므로 다음 MVP 재빌드부터 반영.
- 셀 meta 크기 +2–4 KB(gzip 전). 지명이 바뀌려면 MVP 재빌드(셀 meta)가 필요하다.
