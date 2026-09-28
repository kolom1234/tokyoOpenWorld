# ADR-0022: 셀 fetch·디코드 워커 경로 (M02-T02)
- Status: Accepted
- Date: 2026-09-28

## Context
M02-T02에서 06 §2·§4·§7·§9의 fetch(AbortController, 재시도 3회, Cache Storage)와 디코드 워커(TKC → CellPayload, meshopt·gzip, Transferable)를 구현했다.
문서가 정하지 않은 것: fetch를 어느 스레드에서 할지, glb를 무엇으로 풀지(streaming은 three를 모른다 — 06 §1, depcruise),
재시도 대상·지연, 워커 수, 취소가 워커 안 작업을 어디서 끊는지, 결과 검증 기준. M01-T06 임시 로더(`apps/game/src/debug/local-cells.ts`,
three `GLTFLoader` 메인 스레드)가 M02-T05에서 이 경로로 바뀌어야 하므로 `CellPayload` 형태도 같아야 한다.

## Decision
1. **fetch = 메인(비동기만), 디코드 = 워커.** 06 §10의 파일 구성(fetcher / scheduler / decode.worker)과 06 §4의 동시성(동시 fetch 8, 디코드 대기 = 워커 수 × 2)을
   스케줄러 한 곳에서 제어하기 위해서다. 메인이 하는 일은 `await fetch`/Cache Storage와 `postMessage(bytes, [bytes])`뿐(파싱·해시 없음).
   캐시 저장은 `Response.clone()`을 `cache.put`(메인 JS 복사 없음). hash32 검사(XXH64, 셀당 수 ms)는 워커에서.
2. **glb = 자체 부분집합 파서 + `meshoptimizer/decoder`**(워커, three 없음). 파이프라인 writer가 쓰는 형태만 받는다(05 §4에 명시):
   노드 1개(이동 + 균일 스케일), TRIANGLES, meshopt ATTRIBUTES/TRIANGLES/INDICES(+필터). 밖이면 `unsupported`.
   출력 = ADR-0020 규약 그대로(glTF 이름, POSITION 셀 로컬 float32, 밀집 배열, `boundsLocal` = accessor min/max × 노드 변환) → render 변경 없이 교체 가능.
   속성 배열은 전부 새 버퍼(서로·입력과 공유 없음) → 개별 transfer, 중복 없는 transfer 목록.
3. **재시도**: 첫 시도 + 3회, 지연 250 → 500 → 1000 ms(취소 가능 대기). 대상 = 네트워크 오류·408·429·5xx·크기 ≠ cells.idx. 404 등 나머지 4xx·취소는 즉시.
   캐시 적중인데 크기가 다르면 삭제 후 네트워크. 워커가 파일 손상(`mismatch`·TkcErrorCode)을 보고하면 캐시 항목 삭제(`Fetcher.invalidate`).
4. **워커 풀**: 워커 수 = `hardwareConcurrency − 2`, 1…4(메인·렌더 몫 2코어). 워커당 동시 2개. core `WorkerSupervisor`로 감독(재시작 백오프).
   워커가 죽으면 그 워커의 작업은 `worker` 오류(바이트는 transfer돼 사라짐 → 재요청은 캐시에서, 정책은 M02-T03 lifecycle).
5. **취소**: 셀별 AbortController 하나가 fetch·백오프·디코드를 끊는다. 워커 안에서는 요청별 AbortController + **단계 경계(섹션·프리미티브)마다
   매크로태스크 양보(setTimeout 0)** → 대기 중인 `cancel` 메시지가 처리되고 다음 단계로 가지 않는다(`cancelled`만 응답, payload 없음).
   한 프리미티브의 meshopt 해제는 끊지 않는다(수 ms). 메인은 abort 즉시 `aborted`로 resolve하고, 늦게 온 결과는 요청 id로 폐기.
6. **검증 기준 = 파이프라인 디코더 스냅샷**: `tests/fixtures/snapshots/world-mini-decode.json`을 gltf-transform(파이프라인 `decodeGlb`)로 만들고
   (`tools/pipeline/test/world-mini-decode.test.ts`), 런타임 디코더는 같은 파일과 정점·인덱스 수 + 속성 레이아웃 + 내용 해시까지 일치해야 한다(Node·실제 워커 스레드·Chromium e2e).
7. `onReady` 기본 섹션 = 렌더 메시 6종 + `terrain.height`. `requestSections`용 `collision.bin`·`lanes.bin`·`nav.bin`(ArrayBuffer)·`meta.json`(파싱)도 지원.
   props/trees/lights/audio 디코더는 해당 태스크(M04~)에서.
8. 저수준 팩토리(`createFetcher`·`createDecodePool`·`purgeStaleCaches`·`DEFAULT_STREAMING_CONFIG`)를 `@sanpo/streaming`에서 공개한다
   (M02-T03 `createStreaming`이 조립, 그 전까지 게임 디버그 프로브 `?probe=decode`가 사용).

## 측정 (world-mini 4셀, 484–903 KiB)
- 워커 디코드(hash32 포함), headless Chromium 모듈 워커(클라우드 컨테이너 4코어, 워커 2): 1차(네트워크) **25–111 ms/셀**, 2차(Cache Storage) **25–76 ms/셀**,
  4셀 동시 84–153 ms. Node 단일 스레드 워밍 후 7–20 ms/셀(첫 셀은 wasm 초기화·JIT로 ≈ 100 ms).
- 메인 스레드: `decode()` 동기 구간(postMessage + transfer) 중앙값 ≈ 0.1 ms, 단독 실행 최대 1.4 ms(병렬 e2e CPU 경합 시 표본이 6–8 ms로 튐 = 선점),
  50 ms 이상 긴 작업 0건. fetch 2차(캐시) 2–22 ms(비동기 대기).

## Consequences
- M02-T05는 `local-cells.ts`의 `decodeLocalCell`을 풀 결과(`DecodeResult.payload`)로 바꾸면 된다(형태 동일, 속성 이름은 이미 glTF 이름).
- 파이프라인 glb writer를 바꾸면(노드 구조·모드·새 확장) 런타임 파서도 확인해야 한다 → 스냅샷 테스트가 불일치를 잡는다.
- Cache Storage LRU 1.5 GB 상한·60 s 재시도·`requestSections` 경로는 M02-T03.

## Alternatives
- 워커에서 fetch까지: 메인 복사·전송이 없지만 동시 fetch 8 제한·우선순위를 워커 간에 나눠야 하고 06 §10 구성과 다름 → 기각(transfer는 0-copy라 이득 작음).
- three `GLTFLoader`를 워커에서: streaming → three 의존(06 §1 위반), 워커 청크 +수백 KB → 기각.
- `@gltf-transform/core`를 런타임에서: 문서 모델 생성 비용·번들 크기 → 기각(파이프라인 검증용으로만).
- 워커 `terminate()`로 취소: 즉시 멈추지만 워커 재생성(wasm 초기화 ≈ 100 ms)·다른 작업까지 잃음 → 단계 경계 협조 취소 채택.
