// 엔진음 AudioWorklet(M08-T04, ADR-0090 — 11 §1 vehicleBus): 가상 직렬 4기통(특정 실제 차종 아님) 점화 펄스 합성.
// 점화 주파수 = rpm/60 × 2(4행정 4기통). 점화마다 짧은 감쇠 펄스(연소 거칠기 = 잡음) → 저역 쿵(1극 저역) + 배기 공명 2개(rpm 따라 이동) + 흡기 잡음(부하·rpm).
// 실린더별 세기 차이(고정 표)로 엔진다운 맥동. 입력 = k-rate AudioParam rpm·load·level(메인이 setTargetAtTime으로 부드럽게 — 변속 때 RPM 낙하가 그대로 들린다).
// 일반 .js(브라우저 워클릿 전역) — Vite가 같은 출처 에셋으로 내보낸다(CSP script-src 'self' — blob: 불가). process()에서 할당 없음.
const TWO_PI = Math.PI * 2;
const CYL_AMP = [1, 0.96, 1.03, 0.98];

/** 2극 공명기(임펄스 → 감쇠 사인). */
class Reso {
  constructor() {
    this.y1 = 0;
    this.y2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.g = 0;
  }
  set(f, bw, sr) {
    const r = Math.exp((-Math.PI * bw) / sr);
    this.a1 = 2 * r * Math.cos((TWO_PI * Math.min(f, sr * 0.45)) / sr);
    this.a2 = -r * r;
    this.g = 1 - r;
  }
  tick(x) {
    const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  reset() {
    this.y1 = 0;
    this.y2 = 0;
  }
}

/** 순수 합성기(Node 테스트가 같은 코드를 직접 돌린다). */
export class EngineSynth {
  constructor(sr) {
    this.sr = sr;
    this.phase = 0;
    this.cyl = 0;
    this.env = 0;
    this.decay = Math.exp(-1 / (0.0025 * sr));
    this.thump = 0;
    this.dcX = 0;
    this.dcY = 0;
    this.seed = 0x2468ace1;
    this.r1 = new Reso();
    this.r2 = new Reso();
    this.intake = new Reso();
    this.intake.set(1400, 900, sr);
  }
  noise() {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return (this.seed / 0x1_0000_0000) * 2 - 1;
  }
  /** out[0..n)에 채운다. rpm·load·level = 이 블록 값. */
  render(out, n, rpm, load, level) {
    const sr = this.sr;
    const fire = (Math.max(300, rpm) / 60) * 2;
    const rn = Math.min(1, rpm / 6500);
    this.r1.set(70 + 0.8 * fire, 45, sr);
    this.r2.set(260 + 1.25 * fire, 130, sr);
    const kThump = 1 - Math.exp((-TWO_PI * Math.min(2.5 * fire, 900)) / sr);
    const dcK = 1 - (TWO_PI * 20) / sr;
    const step = fire / sr;
    const pulse = 0.35 + 0.65 * load;
    const bright = 0.35 + 0.65 * load;
    const air = 0.04 * load * (0.3 + 0.7 * rn);
    for (let i = 0; i < n; i++) {
      this.phase += step;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) & 3;
        this.env = CYL_AMP[this.cyl] * pulse * (1 + 0.08 * this.noise());
      }
      const ex = this.env * (0.75 + 0.25 * this.noise());
      this.env *= this.decay;
      this.thump += kThump * (ex - this.thump);
      let y =
        0.8 * this.thump +
        0.6 * this.r1.tick(ex) +
        0.35 * bright * this.r2.tick(ex) +
        air * this.intake.tick(this.noise());
      // DC 제거(20 Hz 고역) + 부드러운 포화.
      const hp = y - this.dcX + dcK * this.dcY;
      this.dcX = y;
      this.dcY = hp;
      y = hp / (1 + Math.abs(hp));
      if (!Number.isFinite(y)) {
        this.r1.reset();
        this.r2.reset();
        this.intake.reset();
        this.thump = 0;
        this.dcX = 0;
        this.dcY = 0;
        y = 0;
      }
      out[i] = y * level;
    }
  }
}

if (typeof registerProcessor === 'function') {
  class EngineProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'rpm', defaultValue: 800, minValue: 0, maxValue: 9000, automationRate: 'k-rate' },
        { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'level', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }
    constructor() {
      super();
      this.synth = new EngineSynth(sampleRate);
    }
    process(_inputs, outputs, p) {
      const out = outputs[0]?.[0];
      if (!out) return true;
      this.synth.render(out, out.length, p.rpm[0], p.load[0], p.level[0]);
      for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
      return true;
    }
  }
  registerProcessor('sanpo-engine', EngineProcessor);
}
