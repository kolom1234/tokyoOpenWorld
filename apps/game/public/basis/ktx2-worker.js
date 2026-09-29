// KTX2 Basis 트랜스코더 워커 부트스트랩(M03-T06, ADR-0032). three KTX2Loader는 트랜스코더를 Blob 워커로 띄우는데, blob 워커는 문서 CSP를
// 물려받고 basis_transcoder.js(embind)는 `new Function`을 쓴다 → 페이지 CSP(script-src에 'unsafe-eval' 없음)에서 실패한다.
// 이 파일은 같은 출처 정적 스크립트라 자체 응답 헤더 CSP(public/_headers, 'unsafe-eval' 허용)를 받는다.
// 첫 메시지 {type:'sanpo-boot', source}로 KTX2Loader가 만들던 워커 본문(상수 + 트랜스코더 + BasisWorker)을 받아 전역에서 실행하고,
// 이후 메시지('init'·'transcode')는 그 본문이 등록한 리스너가 처리한다. render `materials/ktx2-csp.ts`와 짝.
self.addEventListener('message', function boot(e) {
  if (e.data?.type !== 'sanpo-boot') return;
  self.removeEventListener('message', boot);
  // biome-ignore lint/security/noGlobalEval: 이 워커의 목적 — 생성자(같은 출처 페이지)가 보낸 트랜스코더 본문 실행(ADR-0032).
  globalThis.eval(e.data.source); // 간접 eval = 전역 스코프
});
