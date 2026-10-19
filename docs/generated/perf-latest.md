# perf-latest (자동 생성 — `pnpm perf`, tests/golden/perf.spec.ts)

측정 2026-10-18T20:39Z · viewport 2560×1440 · quality high · dynres off · seconds 40
경로(값 순서): walk = 스크램블 도보 · drive = 시부야 시가지 주행 · fly = 신주쿠 상공 비행

| 지표 | 예산(14 §2) | 값 | 판정 |
|---|---|---|---|
| 프레임 p50 | ≤ 14 ms | 24.41 ms / 24.73 ms / 15.96 ms | ⚠️ |
| 프레임 p95 | ≤ 20 ms | 36.07 ms / 38.33 ms / 35.07 ms | ⚠️ |
| 메인 스레드/프레임 p95 | ≤ 6 ms | 33.5 ms / 33.52 ms / 28.1 ms | ⚠️ |
| 물리 틱 최대 | ≤ 4 ms | 0.85 ms / 5.06 ms / 2.06 ms | ⚠️ |
| sim 틱 p95 | ≤ 12 ms | 9.36 ms / 7.43 ms / 10.81 ms | ✅ |
| JS 힙 최대 | ≤ 1536 MB | 662 MB / 741 MB / 719 MB | ✅ |
| GPU 메모리(장치 증가분) | ≤ 2048 MB | 177 MB / 81 MB / 389 MB | ✅ |
| 스트리밍 정지 | 0회 | 0 / 0 / 0 | ✅ |
| 초기 다운로드 | ≤ 60 MB | 124 MB | ⚠️ |
| 첫 표시 | ≤ 12 s | 10.29 s | ✅ |

| 경로 | 프레임 p50/p90/p95/p99/최대 ms(>25 ms %) | 메인 p50/p95/최대 ms | 드로우콜 | 삼각형 M | 렌더 스케일 최소 | GPU W 중앙/최대(상한) |
|---|---|---|---|---|---|---|
| walk | 24.41/34.08/36.07/132.16/287.86 (45.7%) | 23.27/33.5/292.42 | 284 | 6.98 | 0.85 | 21.1/25.8 (31) |
| drive | 24.73/34.71/38.33/90.04/900.42 (48.1%) | 21.69/33.52/184.16 | 380 | 8.02 | 0.85 | 24.6/30.1 (33.9) |
| fly | 15.96/33/35.07/86.31/435.31 (26.7%) | 15.56/28.1/427.65 | 251 | 6.2 | 0.85 | 22.9/29.6 (33.9) |

- walk 시스템(프레임당 평균/최대 ms): render 23.13/291.6, renderPrep 0.423/6.4, input 0.196/7.4, sim/clock 0.134/0.9, audio 0.106/3.7, wiring.stations 0.043/0.6
- drive 시스템(프레임당 평균/최대 ms): render 21.23/183.2, renderPrep 0.709/23.8, input 0.403/9.6, sim/clock 0.187/0.7, traversal 0.147/0.6, audio 0.104/2.5
- fly 시스템(프레임당 평균/최대 ms): render 15.878/422.3, input 0.83/9.8, renderPrep 0.682/20.2, sim/clock 0.186/1.2, audio 0.095/4.6, traversal 0.061/0.7
초과: 프레임 p50, 프레임 p95, 메인 스레드/프레임 p95, 물리 틱 최대, 초기 다운로드
부팅 로그: 8.52 precompile atmosphere 7413 ms (compile 6927, first render 15, LUT 337), avatar 1 ms · 9.09 staged cells compiled (75 groups) 3240 ms · 9.26 staged cells compiled (75 groups) 164 ms
포토 DOF 전환 최장 프레임(ms): baseline 28 · enter 30 · firstOn 4553 · off 540 · againOn 371
- 기준 GPU는 이 PC 한 대(RTX 3050 4GB Laptop) — 14 §2의 "RTX 3060급 / M1 Pro급 2종" 판정은 ⚠️(다른 기기 미측정).
