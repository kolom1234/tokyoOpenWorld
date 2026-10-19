# ADR-0097: 라이선스 감사 — ODbL 파생 DB 공개 형식, OSS 고지 전문, 측량법 사용 승인은 공개 전 사람 신청
- Status: Accepted (M11-T05)
- Date: 2026-10-19

## Context
- M11-T05: ⚠ 항목 원문 재확인(PLATEAU·GSI 측량법·KSJ N02·Open-Meteo 등), 크레딧 최종 점검, 실존 상표 스캔. 수락 = ⚠ 0개, 크레딧·ODbL 공개 링크 동작.
- 03 §6은 OSM 파생 DB를 `odbl/osm-derived.gpkg`로 공개한다고 적었지만 만들지 않았다. 크레딧의 OSS 목록은 이름·버전·라이선스만이라 MIT·BSD·Apache·OFL의 "고지 전문 동반" 조건을 채우지 못했다.

## Decision
1. **ODbL 4.6 = 파생 DB 전체 제공**: 파이프라인 `map --build-id`가 빌드에 쓴 OSM 정규화 피처 전부(`data/normalized/osm/*.ndjson.gz` + 철도 `osm-rail`)를 한 GeoJSONSeq(`global/odbl/osm-derived.geojsonseq.gz`)로, 우리 보정(`content/markings/osm-crossing-corrections.json`)과 README(ODbL 고지·빌드 id·출처 추출본·방법 = 공개 저장소 파이프라인 + sources.lock)를 함께 둔다 → publish(`GLOBAL_FILE_RE`) → `/world/<buildId>/global/odbl/README.txt`. 크레딧 화면 맨 위 항목이 그 링크(게임 `shell/credits.ts odblEntry`, 픽스처 world-mini 제외). gpkg 대신 GeoJSONSeq — GDAL 없이 Node만, 기계 판독. `map.pmtiles`·셀 OSM 유래 섹션도 ODbL 파생 DB로 README에 고지.
2. **OSS 고지 전문**: 빌드가 `/oss-licenses.txt`(런타임 의존마다 LICENSE·NOTICE 원문, 패키지에 파일이 없으면 package.json 선언 + 저작자·저장소 + 표준 MIT 문구)를 만든다(vite `sanpo-credits`). 크레딧 끝에 `/oss-licenses.txt`·`/third-party-notices.txt`(Rocketbox MIT·Noto OFL) 링크. 크레딧 URL은 클릭 가능한 링크.
3. **실존 상표 스캔은 CI 테스트**(`tools/pipeline/test/trademark-scan.test.ts`): UI 3개 언어·명소 이름·설명·역 안내·가상 브랜드 × `real-brands.txt` — 라틴 이름은 단어 경계, 일본어는 정규화 포함. 노선·역·지명은 사실 표기라 목록 밖.
4. **국토지리원 DEM = 측량법 제30조 사용 승인 신청**(承認申請Q&A Q2-4: DEM으로 입체 지도 작성 = 사용 승인, Q5-4 기반지도정보 무상, Q4-3 수수료 없음, Q5-1 7–14일). 신청자는 사람(사용자) — 원스톱 서비스 계정·신청서. 승인 전에는 production 공개(M11-T06)를 하지 않고, 승인되면 승인번호를 ATTRIBUTION `gsi-dem` 표기·화면 상시 표기(`apps/game/src/credits.ts`)에 넣는다(Q5-2). staging·dev(비공개 확인용)는 그대로.
5. PLATEAU는 FAQ 「手続き不要」·상업 가능 → 표기만. Open-Meteo는 production 호출 0(LIVE_WEATHER=false) 유지. 긴자선(ODPT)은 미수록을 크레딧에 3개 언어로 명시(같은 id ATTRIBUTION 항목이 lock 표기를 덮음).

## Consequences
- 결과·원문 인용 표 = 03 §6.1. ⚠ 0개, 🔶 1개(사람 신청 — 측량법).
- OSM 파생 묶음 크기 ≈ 빌드 OSM 정규화 크기(gz ≈ 3 MB). 새 빌드마다 `map` 단계에서 다시 만든다(이전 빌드 id에는 없음 — 다음 MVP 재빌드부터).
- 측량법 승인 판단은 공개 안내·Q&A 기준의 보수적 해석이다. 지리원이 "불필요"로 회신하면 03 §6.1·이 ADR을 고친다.
