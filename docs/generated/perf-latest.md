# perf-latest (자동 생성 — `pnpm perf`, tests/golden/perf.spec.ts)

측정 2026-11-26T13:37Z · viewport 2560×1440 · quality high · dynres off · seconds 40
경로(값 순서): walk = 스크램블 도보 · drive = 시부야 시가지 주행 · fly = 신주쿠 상공 비행

| 지표 | 예산(14 §2) | 값 | 판정 |
|---|---|---|---|
| 프레임 p50 | ≤ 14 ms | 24.07 ms / 28.22 ms / 16.07 ms | ⚠️ |
| 프레임 p95 | ≤ 20 ms | 35.45 ms / 46.14 ms / 67.26 ms | ⚠️ |
| 메인 스레드/프레임 p95 | ≤ 6 ms | 32.92 ms / 40.77 ms / 65.78 ms | ⚠️ |
| 물리 틱 최대 | ≤ 4 ms | 1.07 ms / 4.25 ms / 1.98 ms | ⚠️ |
| sim 틱 p95 | ≤ 12 ms | 16.21 ms / 8.82 ms / 11.57 ms | ⚠️ |
| JS 힙 최대 | ≤ 1536 MB | 631 MB / 694 MB / 700 MB | ✅ |
| GPU 메모리(장치 증가분) | ≤ 2048 MB | 216 MB / 113 MB / 225 MB | ✅ |
| 스트리밍 정지 | 0회 | 0 / 0 / 0 | ✅ |
| 초기 다운로드 | ≤ 60 MB | 110.4 MB | ⚠️ |
| 첫 표시 | ≤ 12 s | 10.51 s | ✅ |

| 경로 | 프레임 p50/p90/p95/p99/최대 ms(>25 ms %) | 메인 p50/p95/최대 ms | 드로우콜 | 삼각형 M | 렌더 스케일 최소 | GPU W 중앙/최대(상한) |
|---|---|---|---|---|---|---|
| walk | 24.07/33.76/35.45/68.9/240.15 (42.1%) | 22.34/32.92/233.7 | 282 | 7.18 | 0.85 | 22.8/33.2 (34) |
| drive | 28.22/35.97/46.14/94.42/938.58 (66.4%) | 26.61/40.77/201.16 | 385 | 8 | 0.85 | 21.6/28 (34) |
| fly | 16.07/35.22/67.26/141.1/358.3 (26.9%) | 15.31/65.78/335.36 | 254 | 6.33 | 0.85 | 20.2/23.8 (34) |

- walk 시스템(프레임당 평균/최대 ms): render 21.149/232.7, renderPrep 0.54/2.5, input 0.18/7.5, sim/clock 0.169/1.6, audio 0.126/5.2, wiring.stations 0.054/1.1
- drive 시스템(프레임당 평균/최대 ms): render 25.083/199.6, renderPrep 0.66/3.5, input 0.24/9.7, sim/clock 0.177/1.6, traversal 0.143/1, audio 0.093/2.2
- fly 시스템(프레임당 평균/최대 ms): render 20.23/329, input 0.689/8.9, renderPrep 0.625/4.1, sim/clock 0.173/1, audio 0.107/7.7, traversal 0.06/1.1
초과: 프레임 p50, 프레임 p95, 메인 스레드/프레임 p95, 물리 틱 최대, sim 틱 p95, 초기 다운로드
부팅 로그: 8.75 precompile atmosphere 7605 ms (compile 7001, first render 26, LUT 411), avatar 1 ms · 9.22 staged cells compiled (75 groups) 2702 ms · 9.40 staged cells compiled (75 groups) 178 ms
포토 DOF 전환 최장 프레임(ms): baseline 32 · enter 33 · firstOn 2505 · off 524 · againOn 346
- 기준 GPU는 이 PC 한 대(RTX 3050 4GB Laptop) — 14 §2의 "RTX 3060급 / M1 Pro급 2종" 판정은 ⚠️(다른 기기 미측정).
