# ADR-0012: hash32 = xxHash32 라운드 + 파트 타입 태그, rng = xoshiro128** (splitmix32 시딩)
- Status: Accepted
- Date: 2026-09-27

## Context
M00-T02 태스크는 hash32를 "FNV-1a/xxhash32 계열 택1"로 열어 두었다. 절차 배치·NPC 시드가 `createRng(hash32(WORLD_SEED, cellId, layer, index))`에
의존하므로 알고리즘·인코딩은 한 번 정하면 월드 모양·세이브·캐시 재현성과 묶인다.

## Decision
- hash32: xxHash32의 워드 라운드(`rotl(h + w·P3, 17)·P4`)와 아발란시 파이널라이저, 시드 `P5`, 끝에 파트 개수를 섞는다.
- 파트 인코딩: 문자열 = 태그 + UTF-16 코드유닛 2개/워드 + 길이, int32 범위 정수 = 태그 + 값, 그 외 수 = 태그 + float64 LE 2워드.
  (`'1'`≠`1`, `-1`≠`0xFFFFFFFF`, `('ab','c')`≠`('a','bc')` 보장)
- rng: xoshiro128**, 32-bit 시드를 splitmix32(γ=0x9e3779b9)로 128-bit 상태로 확장. `Math.imul`/비트 연산만 사용.
- 골든 값은 `packages/core/test/rng-hash.test.ts` 인라인 스냅숏으로 고정.

## Consequences
골든 값 변경 = 모든 절차 배치가 바뀜 → 새 ADR + 세이브/캐시 버전 증가 필요. 스냅숏을 "업데이트"로 덮어쓰지 말 것.

## Alternatives
FNV-1a(더 단순하나 아발란시 약함, 인접 index 시드 상관 ↑ → 기각). 문자열 UTF-8 인코딩(TextEncoder 할당 → 핫패스 부적합, 기각).
