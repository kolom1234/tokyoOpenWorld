# 17 — Roadmap (인덱스)

> 태스크 상세는 마일스톤별 파일 `docs/roadmap/MNN.md`에 있다. 세션은 **해당 태스크 블록만** 읽는다:
> `grep -n "### M03-T04" docs/roadmap/M03.md` → 해당 줄부터 25줄 Read.
> 태스크 ID 형식: `MNN-TNN` (예: `M03-T04`). 크기: S(≤1세션) / M(2–3세션) / L(4+세션, 하위 단계 `.a/.b`로 분할해 진행).

## 마일스톤 개요 (순서 = 의존 순서)
| ID | 이름 | 목표(완료 정의) | 파일 |
|---|---|---|---|
| M00 | Foundation | 모노레포·CI·코어·부팅 골격·로컬 dev 동작 | `roadmap/M00.md` |
| M01 | Geo & First Cell | 스크램블 교차로 3×3 셀이 실측 높이로 보임(자유비행) | `roadmap/M01.md` |
| M02 | Streaming & Deploy | MVP 전역 건물+지형 스트리밍, HLOD, Cloudflare staging 배포 | `roadmap/M02.md` |
| M03 | Rendering Realism I | 대기·태양·그림자·절차 파사드·유리·포스트·품질 티어·골든뷰 | `roadmap/M03.md` |
| M04 | Physics & Walking | Jolt 워커, 셀 콜라이더, 1/3인칭 도보(계단·연석·에스컬레이터) | `roadmap/M04.md` |
| M05 | Street Detail | 도로·연석·노면표시·소품·가로수·랜드마크·가상 간판 | `roadmap/M05.md` |
| M06 | Life: Crowds & Traffic | 신호·군중(3단 LOD)·교통(IDM)·스크램블 재현 | `roadmap/M06.md` |
| M07 | Trains | 야마노테 탑승(서기/좌석/전면전망/빨리감기), 병행선 시각 운행 | `roadmap/M07.md` |
| M08 | Vehicles | 승용차·자전거 물리 + AEB + 소환/독 | `roadmap/M08.md` |
| M09 | Weather, Night, Audio | 날씨·비 표현·구름·야간 조명·사운드·계절 | `roadmap/M09.md` |
| M10 | UI/UX | 셸·HUD·지도·도감·포토모드·세이브·크레딧 | `roadmap/M10.md` |
| M11 | Hardening & Beta | 성능 예산 달성·누수 점검·라이선스 감사·프로덕션 배포 | `roadmap/M11.md` |
| M12+ | Expansion | 긴자·마루노우치 → 아키하바라·우에노 → … (영역 JSON 추가 중심) | (MVP 후 작성) |

## 병렬화 가능 구간
- M03(렌더)과 M04(물리)는 M02 이후 병렬 가능.
- M05와 M06-T01(sim 워커·VAT)은 M04 이후 병렬 가능. M06-T02 이후는 M05-T03(신호등 소품) 완료 후.
- M10-T01(UI 셸)은 M00 이후 언제든 시작 가능(목 브리지 사용).

## 역방향 의존 (주의)
- `M07-T06`, `M08-T04`는 `M09-T04`(오디오 코어)에 의존 → M09-T04 완료 후 수행(그 전까지 PROGRESS에 보류 표시).

## 진행 규칙
- 마일스톤 종료 시: 골든뷰 갱신, 성능 리포트 1회, PROGRESS "Recently Completed" 정리, 필요 시 ADR.
- 범위 변경(태스크 추가/삭제)은 `/new-task`로 블록 추가 + 이 표의 목표 문구 갱신.
