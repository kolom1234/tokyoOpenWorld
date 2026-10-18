# ADR-0093: 지도 — 자체 MVT·PMTiles 생성/읽기, 게임이 디코드해 UI Canvas2D로
- Status: Accepted (M10-T03)
- Date: 2026-10-18

## Context
- 12 §3: `global/map.pmtiles`(vector) → 자체 Canvas2D 렌더러, 레이어 순서 수면 → 공원 → 건물 → 도로 → 철도 → 역 → 라벨 → POI, 하단 상시 출처. M10 규칙: 정규화 데이터로 PMTiles를 만들고 외부 지도 타일 서비스는 쓰지 않는다. 수락: 전체 지도 팬·줌 60 fps, 미니맵 ≤ 1 ms/프레임.
- 의존 규칙: ui는 core만 import(01 §4). tippecanoe·GDAL MVT 드라이버를 쓰면 컨테이너·외부 바이너리가 는다.

## Decision
1. **형식 = 표준**(웹 메르카토르 z/x/y, MVT 2.1, PMTiles v3) — 다른 도구로도 열린다. 인코더·디코더는 `@sanpo/tile-format`에 자체 구현(protobuf varint, 힐버트 tile id, 디렉터리 varint 열, 루트 gzip ≤ 16 KiB 넘으면 잎). 공식 `pmtiles` JS 리더(devDependency)로 테스트 대조 — 런타임 의존 없음.
2. **파이프라인 `map --build-id`(Node만)**: 정규화 PLATEAU 바닥 링(건물 — 400 m² 넘으면 z15, 나머지 z16), 정규화 OSM 도로(등급: major·medium·minor·path, 줌별 시작)·공원·물(`natural=water` — OSM 필터에 추가, 재정규화 필요)·빌드 `global/rail.bin` 선로·역(이름 3개 언어)·places.json 町丁 라벨 점 → z13–16, extent 4096, 버퍼 64, 줌별 Douglas–Peucker(z16 2·나머지 6 단위) → MVT → PMTiles + map-report.json. 메타데이터 attribution = OSM(ODbL)·PLATEAU·GSI·e-Stat.
3. **게임이 읽고 디코드**(`shell/map-source.ts`): 처음 필요할 때(미니맵 마운트 = 첫 표시 뒤) 파일 전체를 받아(MVP ≈ 1.4 MB — Range 대신 한 번에, 로컬 dev 정적 서빙도 동작) 타일 MVT를 디코드해 `UiBridge.map.tile()`로 넘긴다. WF → 메르카토르 = `worldToMap`(geo). ui는 여전히 core만 의존.
4. **UI 렌더러**: 타일을 512 px 캔버스(OffscreenCanvas)로 한 번 래스터해 LRU(96) — 보기는 비트맵 drawImage + 화면 정렬 라벨(역 우선, 70×26 px 격자 겹침 제거)·표식·플레이어 화살표. 래스터는 `pump(예산)` — 미니맵 프레임당 1장, 전체 지도 6 ms, 최근 요청 먼저. 없는 타일은 이미 래스터한 부모 일부로 대신(부모를 새로 요청하지 않는다 — 큐 밀림 실측 수정).
5. **미니맵** = HUD 오른쪽 아래 원형 200 px, 줌 16.3(≈ 310 m 지름), HUD 시그널이 바뀔 때만(움직일 때 ≤ 10 Hz — 위치 0.1 m·시선 0.01 rad 양자화) 다시 그림, 북쪽 고정(기본)·회전(설정, N 표시).
6. **전체 지도(M·일시정지 메뉴)**: 팬 WASD·끌기·패드 R스틱, 줌 Q/E·휠·패드 LT/RT, 컨트롤러가 rAF에서 바뀐 것만 그림(preact 렌더 없음). 빠른 이동 목록 = 역 개찰구·장소 프리셋 7곳(시작 지점 3곳 열림, 나머지 60 m 안에 가 보면 열림 — "발견한 곳만"), 포커스하면 지도가 그곳으로, Enter·Ⓐ = 이동. 레이어 토글 지명·역/철도. 출처 줄 상시.

## Consequences
- 실제 GPU(RTX 3050 Laptop, 1600×900, 21–25 W): 미니맵 0.11–0.12 ms/회·9 회/s → 프레임 평균 0.016–0.018 ms ✅(≤ 1 ms), 전체 지도 팬·줌 p50 60 fps·p95 16.8 ms ✅, 그리기 0.4–0.75 ms.
- 지도 데이터는 MVP 빌드에 포함(재빌드 + map 단계 필요). world-mini 픽스처에는 없다 → 지도 "데이터 없음"·미니맵 숨김(e2e는 상태만).
- ⚠️ 라벨 글꼴 = 시스템 고딕(서브셋 폰트 미적용), POI 기호는 T04, 건물 높이 음영·도로 이름 라벨 없음.
