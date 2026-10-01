# 14 — Testing, Quality & Performance

## 1. 테스트 피라미드
| 층 | 도구 | 대상 | 규칙 |
|---|---|---|---|
| 단위 | Vitest | 순수 로직: geo 변환, 셀 키, 우선순위 점수, TKC 인코드/디코드 round-trip, IDM, 신호 현시, 열차 운동 프로파일, 시간표 컴파일, 날씨 전이, 세이브 마이그레이션 | 패키지마다 `test/`. 공개 API 기준 테스트 |
| 골든 값 | Vitest | 좌표 변환: pyproj로 산출한 기준점 20개(스크램블, 신주쿠역, 도청 등) 오차 < 1 mm | `packages/geo/test/golden.json` |
| 파이프라인 | Vitest + 픽스처 | `tests/fixtures/plateau-mini/`(건물 5동, 도로 3개, DEM 1셀 창) → normalize → 셀 1개 빌드 → 스냅샷 해시(`expected.json`, gzip 섹션은 해제 바이트 기준) + `world-mini` validate | 결정론 검증(2회 빌드 바이트 동일) |
| 워커 통합 | Vitest(browser mode) 또는 Playwright | 물리 워커: 캐릭터가 계단 3단 오르기, 연석 올라서기, 차량 0→60 km/h 시간 범위, 자전거 직진 안정 | 수치 허용 오차 명시 |
| E2E 스모크 | Playwright(Chromium) | 부팅(`?world=mini` 픽스처 월드) → 스폰 → 10 s 걷기 → 모드 전환 → 오류 없음. 현재(M01-T07): 부팅 + 월드 데이터 로드(`#app[data-world=loaded]`)까지 | CI는 WebGL 폴백 강제(`?backend=webgl`, M01-T06~). 정지 떨림(`flicker.spec.ts`): `?forcePost=1`로 SwiftShader에서 GTAO+TAAU 체인, 연속 8프레임 휘도 차(ADR-0038). **대기는 상태 기반**(`tests/e2e/game.ts`): 오버레이 `data-settled`(스트리밍·HLOD 페이드·머티리얼·첫 품질 티어) + 프레임 수, 키 탭 = 2프레임 처리 뒤 확인, 캡처 = 게임 루프 직후 캔버스(page.screenshot 아님). 워커 2(로컬·CI 동일) |
| 골든뷰(시각 회귀) | Playwright + 스크린샷 비교 | §3 카메라 북마크 6곳, 고정 시각·날씨·시드 | 픽셀 차 임계 2%(SSIM ≥ 0.97). 로컬 WebGPU 머신에서 갱신 |
| 성능 | `pnpm perf` | §2 예산 | CI 비차단(리포트), 릴리스 전 차단 |

## 2. 성능 예산 (High 티어, 1440p, RTX 3060급 / M1 Pro급)
| 지표 | 예산 | 측정 |
|---|---|---|
| 프레임 p50 / p95 | ≤ 14 ms / ≤ 20 ms | 스크립트 비행 경로 3종(스크램블 도보, 메이지도리 주행, 신주쿠 상공 비행) |
| 메인 스레드 작업/프레임 | ≤ 6 ms (스트리밍 적용 ≤ 2 ms 포함) | `performance.measure` 구간 |
| 물리 틱 | ≤ 4 ms @120 Hz (워커) | 워커 내부 타이머 |
| sim 틱 | ≤ 12 ms @30 Hz (워커) | 동상 |
| JS 힙 | ≤ 1.5 GB | `performance.memory`(Chromium) |
| GPU 메모리 추정 | ≤ 2.0 GB | renderer.info + 텍스처 합산 |
| 초기 다운로드 | ≤ 60 MB | 부팅 완료 시 전송 바이트 |
| 첫 플레이 가능 | ≤ 12 s (100 Mbps, 캐시 없음) | 부팅 타임라인 |
| 스트리밍 정지 | 0회 (도보·차량 60 km/h) | "발밑 셀 미적재" 이벤트 수 |
- 결과는 `perf-results/<date>.json`(원본, AI 읽기 금지) + `docs/generated/perf-latest.md`(자동 요약: 지표·예산 대비·초과 항목, ≤ 60줄). 예산 초과 시 원인 태스크 생성.

## 3. 골든뷰 북마크 (`tests/golden/views.json`)
| ID | 위치 | 시각/날씨 | 목적 |
|---|---|---|---|
| `shibuya-scramble-noon` ★ | 스크램블 교차로 북서 모서리, 지면 + 7 m | 5/15 12:00 맑음 | 건물·노면표시·군중 밀도 |
| `shinjuku-west-highrise` ★ | 서신주쿠 초고층가 동쪽 가로 → 도청 | 6/21 17:30 맑음 | 초고층 커튼월·반사·대기 산란 (구 `shinjuku-west-dusk`) |
| `yoyogi-aerial-300m` ★ | 요요기 공원 상공 300 m → 신주쿠 | 5/15 10:00 맑음 | HLOD 원경·공중원근·스카이라인 |
| `shibuya-residential-lowrise` ★ | 富ヶ谷 저층 주택가(L0 −4,−3), 지면 + 11 m | 5/15 14:00 맑음 | 주택·맨션 파사드·지붕·지면 |
| `shibuya-scramble-night-rain` | 스크램블과 동일 | 5/15 21:00 비 | 젖은 노면 반사·간판·광원 |
| `omotesando-zelkova-autumn` | 오모테산도 느티나무길 | 11/15 15:00 맑음 | 식생·계절·그림자 |
| `aerial-shinjuku-400m` | 신주쿠 상공 400 m | 5/15 16:00 맑음 | HLOD 전환·원경 스카이라인 |
| `yamanote-front-view` (M07에서 추가) | 하라주쿠→요요기 전면 전망 | 10:00 흐림 | 철도 스플라인·선로 주변 |
- ★ = core 4장: M03부터 렌더 태스크마다 before/after를 `docs/screenshots/M03/<task>/<id>.jpg`(1920×1080 JPEG)로 남긴다.
- 실행·환경 변수: `tests/golden/README.md`. 실제 GPU Chrome 2560×1440, `#app[data-golden=ready]`(스트리밍 큐 0·HLOD 페이드 0·추가 조건 1.5 s 유지) 뒤 캡처.
- 재현성 기준: 동일 머신 연속 2회(새 브라우저 컨텍스트) SSIM ≥ 0.99(`GOLDEN_REPEAT=1`).

## 4. 실측 정확도 검증
- 랜드마크 20곳 높이: 파이프라인 validate 단계(04 §4.6).
- 도로 중심선: OSM 대비 무작위 100점 오차 ≤ 1.5 m.
- 시각 비교: 자체 촬영/사용권 확보 사진과 동일 화각 골든뷰를 나란히 놓는 수동 체크리스트(`docs/generated/fidelity-review.md`, 마일스톤마다).

## 5. 품질 게이트 (PR 머지 조건)
1. `pnpm check` 통과 (Biome, tsc `--noEmit` strict, dependency-cruiser).
2. `pnpm test` 통과, 변경 패키지 커버리지 하락 없음(순수 로직 패키지 목표 80%).
3. 공개 API 변경 시 모듈 카드 갱신 확인(PR 템플릿 체크박스).
4. 새 외부 소스 → ATTRIBUTION/sources.lock 갱신.
5. 파일 400줄 / 함수 60줄 제한(Biome 규칙 + `scripts/check-size.ts`).
