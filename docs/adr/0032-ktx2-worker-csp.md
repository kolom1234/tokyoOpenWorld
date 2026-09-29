# ADR-0032: KTX2 트랜스코더 워커 CSP와 staging 첫 반영 (M03-T06)
- Status: Accepted
- Date: 2026-09-29

## Context
M03-T01(머티리얼 KTX2)·T02(대기)는 로컬 dev(CSP 없음)에서만 확인했고, T06에서 처음 staging에 올리자 세 가지가 드러났다.
1. `pipeline publish`가 world.json·cells.idx·`.tkc`만 올려 `shared/materials/*`가 R2에 없었다.
2. three KTX2Loader는 Basis 트랜스코더(emscripten embind — `new Function`)를 **Blob 워커**로 띄운다. blob 워커는 페이지 CSP를 물려받고,
   페이지 CSP는 `script-src 'self' 'wasm-unsafe-eval'`이라 EvalError → 텍스처 적재가 끝나지 않아 골든뷰가 `settling`에서 멈췄다.
3. takram 하늘(aerialPerspective·skyBackground)의 별(StarsNode)이 기본 데이터를 `media.githubusercontent.com`에서 받는다(CSP 차단, dev에선 외부 런타임 의존).

## Decision
1. publish 대상에 `shared/materials/<name>.(json|ktx2)` 추가(`image/ktx2`).
2. **정적 부트스트랩 워커** `/basis/ktx2-worker.js`(같은 출처 파일 → 응답 헤더 CSP를 따로 받음): 첫 메시지로 KTX2Loader가 만들던 본문
   (상수 + basis_transcoder.js + BasisWorker)을 받아 전역 eval, 이후는 원래 워커와 같다. render `materials/ktx2-csp.ts`가 `init()`만 교체
   (three r186 내부 필드 의존 — 업그레이드 때 대조). `_headers`에서 이 경로만 `! Content-Security-Policy`로 전역 CSP를 떼고
   `default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'`. **페이지 CSP는 그대로**.
   대안: 페이지에 `'unsafe-eval'`(범위 과대), 트랜스코더 재빌드(`-sDYNAMIC_EXECUTION=0`/EMBIND_AOT — emsdk 빌드 체인 추가), 비Basis BC7 KTX2(전송량 5–10배) — 기각.
3. 별 끔(`showStars = false`) — 밤하늘 자체 에셋(라이선스 확인)과 함께 M09에서.

## Consequences
- staging(`tokyo-sanpo-staging`)에서 머티리얼 적재·골든 4장 `ready` 확인. 워커 컨텍스트만 eval 허용(DOM 없음, 같은 출처 본문).
- 첫 로드 측정(GOLDEN_BOOT, 새 컨텍스트): T06 데이터 79.0 MB(world 78.6)·첫 표시 10.7 s. 같은 클라이언트로 M02 데이터 = 77.0 MB·8.6 s →
  **데이터 증가(T04+T06) ≈ +2.0 MB**. M03 전 기준 59.8 MB(6.9 s)와의 차이는 첫 표시가 늦어진 동안(셰이더 선컴파일 ≈ 5 s·대기 LUT) 스트리밍이 계속
  선적재한 몫 → 첫 표시 전 적재 범위 제한 또는 선컴파일 단축이 필요(PROGRESS 후속).
