# @sanpo/streaming
Layer: L2 | Depends: core, geo, tile-format, meshoptimizer(디코더) | Used by: apps/game(wiring)

## Purpose
관심점 기반 셀 로딩·디코드·해제. three/render/physics/sim을 모른다. 결과는 `CellPayload`(tile-format 타입, TypedArray)를 `onReady` 콜백으로 단일 전달.
상세 스펙: `docs/06-world-streaming.md` (API 전문은 §9).

## Public API (요약)
`createStreaming(deps) → StreamingService`:
`setInterest, ack, whenReady, stateOf, groundHeightAt, onReady, onEvicted, requestSections, stats` (+ `SystemProvider`: phase 50).
- **구현됨(M02-T01)**: `api.ts` = `StreamingConfig { interest: InterestConfig; priority: PriorityConfig; residentMax }`(기본값 `internal/config.ts`
  `DEFAULT_STREAMING_CONFIG`, 수치 06 §3–4·ADR-0021). 서비스(`createStreaming`)는 아직 없음(T02–T03).
- 내부 순수 함수(패키지 밖 비공개): `cell-index.ts` `parseCellIndex/createCellIndex → CellIndex{has,get,byteLength,keysAt,extentAt}`,
  `interest.ts` `computeDesired(index, frame, resident, cfg) → {load, keep}`, `planEvictions`, `l0RadiusM/l1RadiusM/levelRule`,
  `priority.ts` `scoreCells/rankCells(candidates, frame, cfg)`, `geometry.ts` `InterestFrame{points, mode, tier, groundHeightAt?}`·거리·뷰 쐐기.

## Invariants
- 발밑 L0 셀은 항상 최우선.
- `onReady` ≤ 2/프레임, 메인 적용 ≤ 2 ms/프레임.
- 상주 한도(L0 72, **L1 80**, L2 64, L3 16 — ADR-0021)는 소프트 리밋(로드 반경 내 셀은 해제 금지). 해제 반경 = 로드 반경 × 1.25. R0 ≤ 768 m.
- 발밑 셀 점수 −1 고정(다른 점수 ≥ 0). 부모가 같은 요청 후보면 자식 점수 ≥ 부모 + 0.001(발밑 면제). `cells.idx`에 없는 셀은 요청 안 함.
- 모드·품질 티어는 `InterestPoint`가 아닌 `InterestFrame`으로 입력(서비스가 `mode/changed`·`quality/changed` 추적).
- `live` = render ack. physics 콜라이더는 `requestSections`로 별도 공급.
- 디코드 결과 배열은 소비자에게 소유권 이전(메인에서 재사용 금지). 예외: heightfield(ground 질의용 보관).
- Cache Storage 이름에 buildId 포함, 부팅 시 타 buildId 삭제.

## Files
cell-index.ts, interest.ts, priority.ts, geometry.ts, config.ts(순수), scheduler.ts, fetcher.ts, decode.worker.ts, lifecycle.ts, ground.ts.

## Tests
priority/interest 단위, lifecycle 상태 전이, 헤드리스 이동 시뮬(목 fetcher), world-mini 디코드 통합.

## Status
M02-T01 완료(관심·우선순위·cells.idx 조회 순수 함수 + 테스트 3파일). fetcher·워커·lifecycle·서비스는 M02-T02~T03.

## Gotchas
- `KTX2Loader`는 render 소관(streaming은 텍스처를 다루지 않음 — 셀에는 텍스처 없음).
- AbortController 취소 후 늦게 도착한 워커 결과는 폐기(요청 세대 번호 비교).
