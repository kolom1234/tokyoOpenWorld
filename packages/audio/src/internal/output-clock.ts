// 오디오 출력 시계 감시(M08-T04 수락 "오디오 스레드 언더런 0"의 측정): 1 s마다 getOutputTimestamp()의 컨텍스트 시각 증가를 성능 시각 증가와 비교 —
// 렌더 스레드가 버퍼를 못 채우면(언더런) 장치 출력이 멈춘 만큼 컨텍스트 시각이 뒤처진다. 20 ms 넘게 뒤처진 구간 수 = glitches.
const WINDOW_S = 1;
const LAG_S = 0.02;

export class OutputClock {
  glitches = 0;
  private acc = 0;
  private prev: { ctx: number; perf: number } | null = null;

  update(ctx: AudioContext, dtS: number): void {
    this.acc += dtS;
    if (this.acc < WINDOW_S || typeof ctx.getOutputTimestamp !== 'function') return;
    this.acc = 0;
    const ts = ctx.getOutputTimestamp();
    if (ts.contextTime === undefined || ts.performanceTime === undefined || ctx.state !== 'running') {
      this.prev = null;
      return;
    }
    const now = { ctx: ts.contextTime, perf: ts.performanceTime / 1000 };
    const p = this.prev;
    this.prev = now;
    // 성능 시각이 안 움직였으면(탭 숨김 등) 판정하지 않는다.
    if (p && now.perf - p.perf > 0.1 && now.perf - p.perf - (now.ctx - p.ctx) > LAG_S) this.glitches++;
  }
}
