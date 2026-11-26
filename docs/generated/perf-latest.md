# perf-latest (자동 생성 — `pnpm perf`, tests/golden/perf.spec.ts)

측정 2026-11-26T17:05Z · viewport 2560×1440 · quality high · dynres off · seconds 40
경로(값 순서): walk = 스크램블 도보 · drive = 시부야 시가지 주행 · fly = 신주쿠 상공 비행

| 지표 | 예산(14 §2) | 값 | 판정 |
|---|---|---|---|
| 프레임 p50 | ≤ 14 ms | 17.85 ms / 22.79 ms / 15.45 ms | ⚠️ |
| 프레임 p95 | ≤ 20 ms | 35.43 ms / 38.11 ms / 45.13 ms | ⚠️ |
| 메인 스레드/프레임 p95 | ≤ 6 ms | 21.68 ms / 33.9 ms / 39.61 ms | ⚠️ |
| 물리 틱 최대 | ≤ 4 ms | 0.99 ms / 4.63 ms / 2.15 ms | ⚠️ |
| sim 틱 p95 | ≤ 12 ms | 9.69 ms / 8.35 ms / 13.56 ms | ⚠️ |
| JS 힙 최대 | ≤ 1536 MB | 645 MB / 718 MB / 711 MB | ✅ |
| GPU 메모리(장치 증가분) | ≤ 2048 MB | 17 MB / 113 MB / 221 MB | ✅ |
| 스트리밍 정지 | 0회 | 0 / 0 / 0 | ✅ |
| 초기 다운로드 | ≤ 60 MB | 122 MB | ⚠️ |
| 첫 표시 | ≤ 12 s | 10.34 s | ✅ |

| 경로 | 프레임 p50/p90/p95/p99/최대 ms(>25 ms %) | 메인 p50/p95/최대 ms | 드로우콜 | 삼각형 M | 렌더 스케일 최소 | GPU W 중앙/최대(상한) |
|---|---|---|---|---|---|---|
| walk | 17.85/34.33/35.43/37.06/317.88 (20.7%) | 16.76/21.68/145.02 | 281 | 7.19 | 0.85 | 32.6/36.3 (35.5) |
| drive | 22.79/34.86/38.11/105.74/903.79 (35.5%) | 20.43/33.9/180.42 | 371 | 7.9 | 0.85 | 24.2/27.3 (34) |
| fly | 15.45/34.2/45.13/92.03/371.76 (25.3%) | 14.93/39.61/345.66 | 256 | 6.34 | 0.85 | 23.6/29 (34) |

- walk 시스템(프레임당 평균/최대 ms): render 15.972/143.8, renderPrep 0.629/6.7, sim/clock 0.176/0.7, input 0.17/8.3, audio 0.129/4.2, traversal 0.055/0.9
- drive 시스템(프레임당 평균/최대 ms): render 21.021/179.3, renderPrep 0.693/9.2, input 0.315/9.2, sim/clock 0.172/0.7, traversal 0.149/7.5, audio 0.113/3.3
- fly 시스템(프레임당 평균/최대 ms): render 16.671/338.7, renderPrep 0.822/28, input 0.666/7.5, sim/clock 0.169/1.1, audio 0.098/4.8, traversal 0.056/0.6
초과: 프레임 p50, 프레임 p95, 메인 스레드/프레임 p95, 물리 틱 최대, sim 틱 p95, 초기 다운로드
부팅 로그: 8.48 precompile atmosphere 7253 ms (compile 6758, first render 15, LUT 307), avatar 1 ms · 9.12 staged cells compiled (75 groups) 3223 ms · 9.27 staged cells compiled (75 groups) 147 ms
포토 DOF 전환 최장 프레임(ms): baseline 46 · enter 30 · firstOn 2943 · off 495 · againOn 318
- 기준 GPU는 이 PC 한 대(RTX 3050 4GB Laptop) — 14 §2의 "RTX 3060급 / M1 Pro급 2종" 판정은 ⚠️(다른 기기 미측정).
