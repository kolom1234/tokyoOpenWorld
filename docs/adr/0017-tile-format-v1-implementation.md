# ADR-0017: TKC v1 구현 세부 — 결정론 레이아웃, XXH64 해시, 헤더 gzip 미지원, 레인 노드 인덱스, Result 기반 리더
- Status: Accepted
- Date: 2026-09-28

## Context
M01-T04에서 `docs/05-tile-format.md`를 `@sanpo/tile-format`으로 구현하면서 스펙이 열어 둔(또는 적지 않은) 항목을 정해야 했다.
M01-T05(셀 빌드)는 "2회 빌드 바이트 동일"을 수락 기준으로 삼으므로 인코더 출력이 입력 순서·플랫폼에 흔들리면 안 된다.

## Decision
1. **writer 결정론**: 헤더 JSON = 고정 키 순서(스키마 필드만), `sections` type 사전순, `sources` 정렬·중복 제거, codec은 레지스트리에서 채움
   (호출자는 codec을 넘기지 않음). 헤더 길이 ↔ 섹션 오프셋은 고정점 반복. 꼬리 패딩 없음. 미등록 타입·중복·레벨 불허·빈 sources는 throw.
2. **해시**: 섹션 `hash` = `xxh64:` + XXH64(seed 0) hex(저장 바이트 기준). cells.idx `hash32` = .tkc 파일 XXH64의 하위 32비트.
   구현은 BigInt 없이 u32 hi/lo 연산(Node 22 기준 ≈ 60 MB/s). 골든 = python-xxhash(`test/hash.test.ts`).
3. **헤더 gzip(flags bit0) 미지원**: `readTkc`는 동기 API이고 `DecompressionStream`은 비동기라 v1은 flags = 0만 쓰고 읽는다(0 아니면 `flags` 오류).
   헤더는 수 KB라 이득이 작다. 필요해지면 formatVersion 2에서 비동기 리더와 함께 도입.
4. **리더는 throw 대신 `Result<_, TkcError>`**: `readTkc`, `readCellsIndex`, `parseJcol`, `parseLanes`, `parseHeightfield`, `gunzip`.
   손상 데이터는 복구 가능 오류(15 §5). 모듈 카드 초안의 `readCellsIndex(): CellsIndex`, `parseJcol(): JcolShape[]` 등은 이렇게 바뀐다.
   `TkcErrorCode` = truncated | magic | version | flags | header | range | align | corrupt.
5. **미지 섹션**: 코덱 검사·색인 없이 무시하되 범위·정렬·겹침 검사는 적용(파일 구조 무결성은 버전과 무관).
6. **lanes.bin `fromNode/toNode` = 청크 내 노드 배열 인덱스**(스펙에 명시 없음). O(1) 조회, 글로벌 연결은 `portalKey`로.
   `LaneGraphChunk`는 sim 워커 핫루프용 SoA TypedArray.
7. **gzip**: `CompressionStream` 출력의 OS 바이트(헤더 offset 9)를 0xFF로 정규화 → Windows/Unix zlib 빌드 차이 제거.
   deflate 스트림 자체는 런타임 zlib 버전에 의존하므로 파이프라인 재현성은 컨테이너 Node 버전 고정(24.21.0)에 기댄다.
8. **terrain.height** 인코더/디코더와 `quantizeHeightfield`(minH = floor(min/step)·step, f32)도 이 패키지에 둔다(M01-T05 필요).
9. **`stats`의 tris·colliderTris·instances 필수**: writer가 항상 쓰므로 `schemas/cell-header.schema.json`에 `required` 추가, 런타임 검사도 동일.
10. **ajv**는 `@sanpo/tile-format` devDependency(8.20.0, 테스트 전용). 런타임 헤더 검사는 손으로 쓴 구조 검사(스키마 부분집합).

## Consequences
- 같은 입력 + 같은 Node 버전 → 같은 .tkc 바이트. 섹션 추가는 레지스트리(api.ts)와 05 §4 동시 갱신.
- XXH64 골든이 바뀌면 모든 섹션 해시가 바뀐다 → 새 ADR 필요.
- 헤더 gzip을 쓰려면 formatVersion 증가.

## Alternatives
- 섹션 해시 SHA-256(WebCrypto): 비동기라 동기 writer와 맞지 않고 스키마 패턴(`xxh64:`)과도 다름 → 기각.
- BigInt XXH64: 구현은 짧지만 64비트 연산마다 BigInt 할당이 생겨 파이프라인·로드 검증 처리량이 떨어진다 → 기각.
- lanes 노드 참조를 id로: 셀 내 id→인덱스 맵이 매번 필요 → 기각.
