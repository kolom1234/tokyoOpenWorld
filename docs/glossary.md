# Glossary (용어집)

| 용어 | 의미 |
|---|---|
| WF (World Frame) | 게임 월드 좌표. EPSG:6677 기반, +X 동, +Y 위(T.P.), −Z 도북, 원점 E0=−12000/N0=−37760 |
| RENDER / PHYS | WF에서 렌더 원점 / 물리 앵커를 뺀 float32 공간 |
| 셀(Cell), L0–L3 | 256 m 정사각 타일(L0)과 4배씩 커지는 HLOD 레벨(1/4/16 km) |
| TKC | Tokyo Cell 컨테이너 파일 포맷(`docs/05-tile-format.md`) |
| HLOD | Hierarchical LOD. 원거리용 병합·단순화 셀 |
| 섹션(Section) | TKC 내부 데이터 블록(terrain.mesh, collision.bin …) |
| 소비자(Consumer) | 셀 payload를 받아 쓰는 시스템(render/physics/sim/audio/ui) |
| buildId | 월드 데이터 빌드 식별자 `YYYYMMDD-<git7>-<lock8>` |
| 파사드 클래스 | 건물 외벽 절차 생성 유형(office_curtain, residential_mansion …) |
| 오버라이드 | 랜드마크를 수작업 모델로 교체(`content/overrides/<gmlId>/`) |
| VAT | Vertex Animation Texture. 인스턴스 보행자 애니메이션 기법 |
| IDM | Intelligent Driver Model. 차량 추종 모델 |
| AEB | 자동 긴급 제동(NPC 보호용) |
| PLATEAU | 国土交通省 3D 도시모델 오픈데이터 프로젝트 |
| LOD1/2/3 (PLATEAU) | 건물 상세도: 박스 / 지붕 형상 / 개구부·부속물 포함 |
| TrafficArea | PLATEAU 도로 LOD2–3의 차도·보도·교통섬 면 |
| T.P. (東京湾平均海面) | 일본 표고 기준면 |
| 平面直角座標系 IX系 | EPSG:6677, 도쿄 지역 평면 좌표계 |
| ODPT | 公共交通オープンデータセンター |
| GTFS / GTFS-JP | 대중교통 시간표 표준 포맷 / 일본 확장 |
| 町丁目 | 동·정목 단위 지명 (HUD 표시) |
| スクランブル交差点 | 전방향 보행 현시가 있는 교차로(보차분리 신호) |
| 前面展望 | 열차 선두 전면 전망 시점 |
| ホームドア | 플랫폼 스크린 도어 |
| 無電柱化 | 전선 지중화(전신주 없음) 구간 |
| ママチャリ | 생활형 자전거(바구니·짐받이) |
