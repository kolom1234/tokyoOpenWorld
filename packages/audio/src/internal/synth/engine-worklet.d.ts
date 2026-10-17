// engine-worklet.js 타입(Node 테스트가 합성기를 직접 돌린다 — 워클릿 자체는 브라우저 전역에서 실행).
export declare class EngineSynth {
  constructor(sampleRate: number);
  /** out[0..n)에 채운다(rpm·load 0..1·level 0..1 = 이 블록 값). */
  render(out: Float32Array, n: number, rpm: number, load: number, level: number): void;
}
