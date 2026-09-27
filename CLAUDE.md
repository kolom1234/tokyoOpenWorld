# CLAUDE.md — TOKYO SANPO (도쿄 산보)

> 이 파일은 모든 AI 세션이 **가장 먼저, 항상** 읽는 유일한 파일이다. 200줄 이하로 유지한다.
> 목적: 컨텍스트가 초기화되어도 이 파일 + `PROGRESS.md`만으로 작업을 정확히 재개할 수 있게 한다.

## 1. 프로젝트 한 줄 요약
실측 공간데이터(PLATEAU·GSI·OSM 등)로 재현한 **가상 도쿄를 걷고·타고·날며 구경하는 브라우저 오픈월드 탐방 게임**.
전투/레이스/대결 없음. 데스크톱 브라우저(WebGPU 우선, WebGL2 폴백). Cloudflare(Workers + R2) 배포.
MVP 구역: 시부야–하라주쿠–신주쿠 (약 3.6 × 5.4 km). 이후 23구로 확장.

## 2. 세션 시작 절차 (반드시 이 순서)
1. 이 파일을 읽는다.
2. `PROGRESS.md`를 읽는다 → "Current Task"와 "Next Steps" 확인.
3. 작업 대상 태스크 ID(예: `M03-T04`)의 블록만 `docs/roadmap/M03.md`에서 grep(`### M03-T04`)으로 찾아 읽는다.
4. 태스크 블록의 `Read:` 목록에 있는 문서/섹션만 읽는다. (문서 전체 통독 금지)
5. 수정할 패키지의 모듈 카드 `docs/modules/<pkg>.md`를 읽는다.
6. 코드 위치가 불확실하면 `docs/generated/CODEMAP.md`를 grep 한다 (전체 read 금지).

## 3. 세션 종료 절차 (컨텍스트 사용량 ~70% 도달 시에도 즉시 수행)
`/handoff` 커맨드(`.claude/commands/handoff.md`) 절차를 따른다. 요약:
- `PROGRESS.md` 갱신 (완료/진행중 파일·함수 단위/다음 한 걸음/블로커)
- 공개 API가 바뀌었다면 해당 모듈 카드 갱신 (같은 커밋)
- 설계 결정이 생겼다면 `docs/adr/NNNN-*.md` 추가
- `pnpm codemap` 실행 → `docs/generated/CODEMAP.md` 재생성
- 커밋 (Conventional Commits, 태스크 ID 포함: `feat(render): M03-T04 facade shader`)

## 4. 문서 지도 (필요한 것만 읽기)
| 파일 | 내용 | 언제 읽나 |
|---|---|---|
| `docs/00-vision.md` | 게임 비전, 필러, 비목표, MVP 범위 | 기획 판단이 필요할 때 |
| `docs/01-architecture.md` | 전체 구조, 스레드, 데이터 흐름, 의존 규칙, 좌표계 | 패키지 경계/좌표 관련 작업 |
| `docs/02-tech-stack.md` | 고정 버전과 선택 근거 | 의존성 추가/업그레이드 |
| `docs/03-data-sources.md` | 데이터 출처·라이선스·출처표기 | 데이터 추가, 크레딧 화면 |
| `docs/04-data-pipeline.md` | 원천 → 정규화 → 셀 빌드 파이프라인 | `tools/pipeline` 작업 |
| `docs/05-tile-format.md` | TKC 셀 컨테이너 바이너리 스펙 | 파이프라인/스트리밍 경계 |
| `docs/06-world-streaming.md` | 그리드, HLOD, 우선순위, 캐시, 예산 | `streaming` 작업 |
| `docs/07-rendering.md` | 렌더러, 조명, 대기, 머티리얼, 포스트, 품질 티어 | `render` 작업 |
| `docs/08-physics.md` | Jolt 워커, 레이어, 캐릭터/차량/자전거 | `physics` 작업 |
| `docs/09-traversal.md` | 도보/전철/차/자전거/자유비행 상태기계, 입력, 카메라 | `traversal`,`input` 작업 |
| `docs/10-simulation.md` | 시계/날씨/군중/교통/열차 | `sim` 작업 |
| `docs/11-audio.md` | 사운드 구조와 라이선스 규칙 | `audio` 작업 |
| `docs/12-ui-ux.md` | HUD/지도/POI/포토모드/설정/i18n/세이브 | `ui` 작업 |
| `docs/13-deployment.md` | Cloudflare Worker/R2, 헤더, 캐시, CI/CD | `apps/worker`, 배포 |
| `docs/14-testing-perf.md` | 테스트 전략, 성능 예산, 골든뷰 | 테스트/성능 작업 |
| `docs/15-conventions.md` | 코딩 규칙, 파일 크기 제한, 네이밍, 에러 처리 | **코드 작성 전 1회** |
| `docs/16-context-protocol.md` | 컨텍스트 관리 규칙 상세 | 문서 구조를 바꿀 때 |
| `docs/17-roadmap.md` | 마일스톤 인덱스 | 마일스톤 전환 시 |
| `docs/roadmap/MNN.md` | 태스크 블록(Read/Files/Do/Accept) | 매 세션 (해당 블록만) |
| `docs/modules/*.md` | 패키지별 모듈 카드(공개 API, 불변식) | 해당 패키지 작업 시 |
| `docs/adr/*.md` | 설계 결정 기록 | 결정을 뒤집고 싶을 때 |
| `schemas/*.json` | 데이터 계약 JSON Schema | 파이프라인↔런타임 경계 |
| `docs/glossary.md` | 용어집(좌표계·일본어 용어) | 용어가 불명확할 때 |

## 5. 절대 규칙 (Hard Rules)
1. **패키지 경계**: 다른 패키지는 반드시 `@sanpo/<pkg>` 인덱스로만 import. 내부 경로 import 금지 (`dependency-cruiser`가 CI에서 차단).
2. **의존 방향**: `docs/01-architecture.md §4`의 레이어 표를 위반하는 import 금지. 순환 금지.
3. **파일 크기**: 소스 파일 ≤ 400줄, 함수 ≤ 60줄. 넘으면 분할한다. (AI 컨텍스트 절약 목적)
4. **계약 우선**: 공개 타입/인터페이스는 `packages/<pkg>/src/api.ts`에만 둔다. 변경 시 모듈 카드 동시 갱신.
5. **좌표계**: 월드 좌표는 항상 WF(World Frame, 미터, +X=동, +Y=위, -Z=북). 변환은 `@sanpo/geo`만 수행. 다른 곳에서 위경도 계산 금지.
6. **라이선스**: 새 데이터/에셋/사운드 추가 시 `docs/03-data-sources.md`의 표와 `content/ATTRIBUTION.json`을 같은 커밋에서 갱신. 출처 불명 에셋 금지. 실제 상표 로고·발차 멜로디·점포 징글 사용 금지.
7. **원천 데이터 비커밋**: `data/{raw,normalized,derived,build}/**`는 git 제외(`data/areas/*.json`, `data/sources.lock.json`은 커밋·편집 대상). 파이프라인은 `data/sources.lock.json`으로 재현 가능해야 한다.
8. **메인 스레드 보호**: 파싱/디코딩/물리/군중 시뮬은 워커에서. 메인 스레드 단일 작업(한 호출) 4 ms 초과 금지, 프레임당 메인 작업 합계 ≤ 6 ms(`14-testing-perf §2`).
9. **성능 예산**: `docs/14-testing-perf.md §2` 예산 초과 PR 금지 (perf 테스트가 판정).
10. **결정론**: 절차적 배치·NPC는 반드시 `createRng(hash32(WORLD_SEED, cellId, layer, index))` 기반. `Math.random()` 금지 (`@sanpo/core`의 `rng` 사용).
11. **대용량 파일 읽기 금지**: `data/{raw,normalized,derived,build}/**`, `dist/**`, `*.glb`, `*.tkc`, `*.ktx2`, `pnpm-lock.yaml`, `perf-results/**`는 읽지 않는다 (`.claude/settings.json` deny). 성능 결과는 `docs/generated/perf-latest.md` 요약만 읽는다.
12. 불확실한 외부 API(three.js 신규 addon 등)는 추측하지 말고 `node_modules/<pkg>`의 `.d.ts`나 소스를 grep해서 확인한다.

## 6. 저장소 구조 (요약 — 상세는 `docs/01-architecture.md §3`)
```
apps/game        브라우저 클라이언트 (Vite). 조립(Composition Root)만 담당
apps/worker      Cloudflare Worker (정적 에셋 + R2 월드 데이터 + API)
packages/core    공통 타입, 이벤트버스, 로거, rng, 설정, 수학
packages/geo     좌표 변환 (EPSG:6668/6677 ↔ WF), 셀 인덱싱
packages/tile-format  TKC 컨테이너 인코더/디코더 (파이프라인·런타임 공용)
packages/streaming    셀 로딩/언로딩, 우선순위, 캐시, 디코드 워커
packages/render       WebGPU 렌더러, 머티리얼(TSL), 조명, 대기, 포스트
packages/physics      Jolt 워커 호스트 + 워커, 캐릭터/차량/자전거
packages/input        액션 맵 (키보드/마우스/게임패드)
packages/traversal    이동 모드 상태기계 + 카메라 리그
packages/sim          시계, 날씨, 군중, 교통, 열차
packages/audio        WebAudio 앰비언스/3D 사운드
packages/ui           Preact HUD/메뉴/지도
tools/pipeline        데이터 빌드 CLI (Node + 외부 바이너리)
tools/codemap         CODEMAP.md 생성기
content/             수작업 에셋 원본(오버라이드 랜드마크, 소품, 머티리얼 정의)
```

## 7. 자주 쓰는 명령
```
pnpm i                      # 설치 (Node 24 LTS, pnpm 10)
pnpm dev                    # 게임 + 워커 로컬 실행 (wrangler dev, 로컬 R2)
pnpm check                  # biome + tsc + depcruise
pnpm test                   # vitest
pnpm test:e2e               # playwright 스모크 + 골든뷰
pnpm perf                   # 자동 비행 경로 성능 측정
pnpm codemap                # docs/generated/CODEMAP.md 재생성
pnpm pipeline <cmd>         # fetch | normalize | build | publish (docs/04 참조)
pnpm deploy                 # wrangler deploy (CI 전용 권장)
```

## 8. 현재 상태
→ `PROGRESS.md` 참조. (이 파일에는 상태를 쓰지 않는다)
