# ADR-0080: 계절·요일 유형 = 법 규칙 생성 공휴일 표 + 계절 키프레임 + 토·휴일 군중 곡선 + 색 기반 옷 색조
- Status: Accepted (M09-T05)
- Date: 2026-10-12

## Context
M09-T05 Do: 계절 테이블(나무 틴트·개화·낙엽, 의상), 휴일 테이블, 평일/주말 밀도 곡선. Accept: 골든뷰 `omotesando-zelkova-autumn` 통과, 날짜 변경 즉시 반영.
나무 수종별 색·잎 밀도는 M05-T04에서 render `trees/season.ts`(dayOfYear)로 이미 구현. sim `SeasonParams`는 상수(0)였고, 요일 유형은 일요일만 휴일이었다.

## Decision
1. **공휴일**: `content/sim/holidays-jp.json`(2026–2035, 178일)을 `tools/pipeline/scripts/holidays-jp.py`가 「国民の祝日に関する法律」 규칙으로 생성 — 고정일·해피 먼데이·춘분/추분(1980–2099 근사식)·대체 휴일(일요일 → 다음 비휴일)·국민의 휴일(휴일 사이 평일).
   내각부 CSV를 받지 않은 이유: 다음 해까지만 공표되고 규칙이 결정적이다. 춘·추분은 매년 2월 관보 공표와 대조해 다르면 표를 고친다. 법 사실이라 출처 표기 대상 아님.
   sim `clock/holidays.ts`(모듈 표) ← `SimDeps.holidays`, 운행일(04:00 경계) 날짜로 판정.
2. **계절 키프레임**: `content/sim/season.json` 11점(dayOfYear) 선형 보간·연말→연초 이어짐 → `EnvironmentState.season`(foliageTint·bloom·leafDensity·outfitPalette). environment()가 매 프레임 시계로 계산 → 날짜를 바꾸면 그 프레임에 반영(나무 = dayOfYear 유니폼, 군중 = outfitPalette 유니폼).
3. **토·휴일 군중 곡선**: `crowd.json density.diurnalHoliday[24]`(출근 봉우리 없음·오후 높음). 워커는 평일 곡선 × 배율을 쓰므로 메인 sim이 비(휴일 곡선 ÷ 평일 곡선, 같은 JST 시)를 날씨 배율에 곱해 보낸다(워커 프로토콜 변경 없음).
4. **옷 색조**: Rocketbox 텍스처에 옷 마스크가 없어 색으로 가른다 — 피부처럼 보이는 화소(r > g > b, 비율 범위)는 그대로, 나머지(옷·머리털)는 겨울(outfitPalette 1) 채도 −35 %·명도 ×0.72, 여름 ×1.08. 근사 ⚠️(베이스별 계절 옷 교체는 에셋 필요).

## Consequences
- 수락: 단위(공휴일·대체·국민의 휴일·운행일 경계·보간·주말 비·날짜 변경 즉시) + 실제 GPU 골든 `omotesando-zelkova-autumn`(PR 본문).
- 한계: 계절 옷은 색조만(반팔·코트 형태 변화 없음), 개화·단풍은 평년 고정(연도별 변동 없음), 공휴일 표 2036년 이후는 일요일만.
