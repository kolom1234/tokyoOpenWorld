# 15 — Coding Conventions

## 1. TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, ESM only.
- `any` 금지(불가피하면 `unknown` + 좁히기). Jolt 바인딩처럼 타입이 약한 곳은 `internal/jolt-*.ts`에 격리.
- `enum` 대신 `as const` 객체 + 유니온 타입.
- 클래스는 상태를 가진 서비스/리소스에만. 순수 로직은 함수.
- 공개 API는 `interface` + `create*` 팩토리. 생성자 직접 노출 금지(교체 가능성 확보).

## 2. 크기 제한 (AI 컨텍스트 절약)
| 대상 | 제한 | 초과 시 |
|---|---|---|
| 소스 파일 | 400줄 | 책임별 분할 |
| 함수 | 60줄 | 헬퍼 추출 |
| 모듈 카드 | 150줄 | 세부는 해당 docs 섹션으로 |
| docs/*.md | 400줄 | 하위 문서로 분할 + 지도 갱신 |
| 셰이더(TSL) 파일 | 250줄 | 노드 함수 단위 분할 |

## 3. 네이밍
- 파일: `kebab-case.ts`, 워커: `*.worker.ts`, 테스트: `*.test.ts`.
- 타입/인터페이스: `PascalCase`. 함수/변수: `camelCase`. 상수: `UPPER_SNAKE`.
- 좌표 변수에 좌표계 접미사 필수: `posWF`, `posRender`, `posPhys`, `posLocal`(셀 로컬), `lonLat`. 단위 접미사: `…M`, `…Ms`, `…Kmh`, `…Deg`, `…Rad`, `…Lux`.
- 이벤트: `'domain/verb-past'` (`cell/ready`).

## 4. 수학 타입 (`@sanpo/core`)
- `Vec3d` = `{ x: number; y: number; z: number }` (float64 논리, WF 저장용)
- `Vec3`, `Quat` = 같은 형태, 의미상 float32 공간(렌더·물리 로컬). three 타입은 render/sim 내부에서만.
- 핫 루프(군중·교통)는 객체 대신 SoA `Float32Array/Float64Array`.

## 5. 에러 처리 & 로깅
- 복구 가능 오류: `Result<T, E>`(`@sanpo/core`) 반환. 예외는 프로그래밍 오류에만.
- `Logger`(스코프 태그: `log.child('streaming')`), 레벨: debug/info/warn/error. `console.*` 직접 사용 금지(Biome 규칙).
- 워커 오류는 메시지로 메인에 전달 → `WorkerSupervisor`가 로깅/재시작.

## 6. 비동기·워커
- 워커 메시지 타입은 `internal/protocol.ts`에 판별 유니온으로 정의(`{ t: 'addCell', ... }`).
- 대용량 데이터는 항상 Transferable 또는 SAB. 구조화 복제로 큰 배열 전송 금지.
- 메인 스레드 `await` 체인이 프레임 루프를 막지 않도록: 루프 안에서는 Promise를 기다리지 않고 상태 폴링.

## 7. 결정론·난수
- `Math.random()` 금지 → `createRng(seed)`(xoshiro128**) 사용. 시드 = `hash32(WORLD_SEED, …parts)`(`@sanpo/core`).
- 파이프라인 출력은 안정 정렬(키 기준) 후 직렬화.

## 8. 설정
- 런타임 설정: `packages/*/src/config.ts`의 기본값 객체 + `apps/game/src/config/*.json` 오버라이드 + URL 쿼리 디버그 플래그(`?debug=1&backend=webgl&tier=low&spawn=shinjuku`).
- 조정 가능한 게임 파라미터(차량 스펙, 군중 밀도, 신호 계획, 계절표)는 코드가 아닌 `content/**.json|yaml`.

## 9. 커밋·브랜치
- Conventional Commits + 태스크 ID: `feat(sim): M06-T05 IDM car following`.
- 브랜치: `m<milestone>/<task-id>-<slug>`. 한 PR = 한 태스크 원칙.
- PR 템플릿: 태스크 ID, 변경 요약, 문서 갱신 체크, 성능 영향, 스크린샷(렌더 변경 시).

## 10. 주석·문서
- 파일 첫 줄 주석: 이 파일의 책임 1줄 + 관련 문서 섹션(`// see docs/07-rendering.md §5`).
- 공개 API에는 TSDoc(단위·좌표계 명시). 구현 세부 주석은 "왜"만.
- 매직 넘버 금지 → 이름 있는 상수 + 출처(기준·문서).
