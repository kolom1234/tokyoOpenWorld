# perf-latest (자동 생성 — `pnpm perf`, tests/golden/perf.spec.ts)

측정 2026-10-18T19:57Z · viewport 2560×1440 · quality high · dynres off · seconds 40
경로(값 순서): walk = 스크램블 도보 · drive = 시부야 시가지 주행 · fly = 신주쿠 상공 비행

| 지표 | 예산(14 §2) | 값 | 판정 |
|---|---|---|---|
| 프레임 p50 | ≤ 14 ms | 15.28 ms / 24.86 ms / 14.63 ms | ⚠️ |
| 프레임 p95 | ≤ 20 ms | 30.37 ms / 45.69 ms / 34.33 ms | ⚠️ |
| 메인 스레드/프레임 p95 | ≤ 6 ms | 17.04 ms / 39 ms / 27.38 ms | ⚠️ |
| 물리 틱 최대 | ≤ 4 ms | 0.64 ms / 3.4 ms / 2.08 ms | ✅ |
| sim 틱 p95 | ≤ 12 ms | 12.81 ms / 7.11 ms / 11.15 ms | ⚠️ |
| JS 힙 최대 | ≤ 1536 MB | 666 MB / 737 MB / 741 MB | ✅ |
| GPU 메모리(장치 증가분) | ≤ 2048 MB | 171 MB / 43 MB / 211 MB | ✅ |
| 스트리밍 정지 | 0회 | 0 / 0 / 0 | ✅ |
| 초기 다운로드 | ≤ 60 MB | 124 MB | ⚠️ |
| 첫 표시 | ≤ 12 s | 9.99 s | ✅ |

| 경로 | 프레임 p50/p90/p95/p99/최대 ms(>25 ms %) | 메인 p50/p95/최대 ms | 드로우콜 | 삼각형 M | 렌더 스케일 최소 | GPU W 중앙/최대(상한) |
|---|---|---|---|---|---|---|
| walk | 15.28/17.22/30.37/33.75/259.34 (6.3%) | 14.18/17.04/31.92 | 222 | 4.96 | 0.85 | 24.1/32.8 (33.9) |
| drive | 24.86/39.4/45.69/52.62/349.62 (49.3%) | 24.03/39/56.73 | 617 | 13.17 | 0.85 | 23.7/30 (33.9) |
| fly | 14.63/32.71/34.33/43.71/175.35 (23.1%) | 14.85/27.38/120.75 | 323 | 9.46 | 0.85 | 23.4/27.6 (33.9) |

- walk 시스템(프레임당 평균/최대 ms): render 12.581/31, renderPrep 0.515/6.9, input 0.174/9.9, sim/clock 0.154/0.8, audio 0.107/3.8, wiring.stations 0.05/0.7
- drive 시스템(프레임당 평균/최대 ms): render 24.061/54.2, renderPrep 0.693/2.8, input 0.391/8.3, sim/clock 0.185/1.4, traversal 0.151/1.4, audio 0.097/2.7
- fly 시스템(프레임당 평균/최대 ms): render 13.892/113.7, input 0.765/13.4, renderPrep 0.66/4.5, sim/clock 0.191/1.4, audio 0.099/5.1, traversal 0.062/0.8
초과: 프레임 p50, 프레임 p95, 메인 스레드/프레임 p95, sim 틱 p95, 초기 다운로드
부팅 로그: 8.55 precompile atmosphere 7465 ms (compile 7001, first render 22, LUT 320), avatar 1 ms · 8.96 staged cells compiled (75 groups) 2959 ms · 9.13 staged cells compiled (75 groups) 174 ms
포토 DOF 전환 최장 프레임(ms): baseline 29 · enter 43 · firstOn 2689 · off 646 · againOn 291

- 기준 GPU는 이 PC 한 대(RTX 3050 4GB Laptop) — 14 §2의 "RTX 3060급 / M1 Pro급 2종" 판정은 ⚠️(다른 기기 미측정).
