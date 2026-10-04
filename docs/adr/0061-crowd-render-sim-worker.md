# ADR-0061: 군중 출력 = sim.worker 30 Hz + SAB 이중 버퍼, 렌더 = 뼈 팔레트 스키닝 풀(베이스 × LOD 48), content/sim = JSON
- Status: Accepted (M06-T01)
- Date: 2026-10-04

## Context
M06-T01 Do: sim.worker 30 Hz 골격, SAB 인스턴스 버퍼(stride 8), VAT 굽기(베이스 12종 × 애니 5종), 인스턴스 색·소지품 변형, 임포스터 스프라이트.
Accept: 더미 보행자 1,000명 원형 걷기 렌더 GPU ≤ 2.5 ms(High). 캐릭터 원천은 ADR-0057(Rocketbox, 리그 23뼈, VAT 대신 뼈 팔레트).

## Decision
1. **sim.worker**(`packages/sim/src/internal/worker/`): `setInterval` 30 Hz, 더미 군중(`crowd/dummy.ts` — 원 궤도, 걷기 85 %·대기 10 %·휴대폰 5 %, `createRng(hash32(WORLD_SEED, 'dumm', i))`)
   → `instance-buffer.ts` SAB: 머리 64 B(Int32 seq·count·front, Float64 anchor·tick 절대 ms) + 이중 데이터 영역 × capacity × 8. 워커는 뒤 영역에 쓰고 front를 뒤집는다.
   필드 = x, y, z(WF − anchor, anchor = 중심의 256 m 격자점), yaw(전방 (−sin, −cos)), anim(**클립 번호 + 속력 ÷ 10**), phase(주기 0..1), variant(u16 외형 씨앗), **rate**(주기/s —
   10 §1의 flags 자리를 외삽용으로 씀). sim은 에셋을 모른다: 베이스·밝기·키는 render가 variant에서 고른다(T04 외형 연속성 = variant 유지).
   호스트 `host.ts`: 감독자 spawn·재시작 시 같은 SAB로 init, SAB 불가(격리 아님)면 군중 없음. `SimService.startWorker({supervisor, crowd, centerWF})` → `SharedInstanceBuffer`.
2. **render 군중**(`packages/render/src/internal/crowd/`): `assets.ts`(crowd.json·bin(meshopt)·ktx2 → 베이스별 속성·LOD 인덱스, 팔레트 RGBA16F 2048폭, 베이스마다 끊어 디코드),
   `material.ts`(MeshStandardNodeMaterial — positionNode에서 4영향 × 2 textureLoad 스키닝, 법선 회전, 인스턴스 yaw·키, 아틀라스 배열 층·밝기, 머리털 알파 테스트),
   `field.ts`(풀 = Mesh + InstancedBufferGeometry — 나무와 같은 이유로 노드 빌드 1번 공유, LOD 거리 12·30·70·250 m, 시야 원뿔, **30 Hz 틱 사이 외삽**(속력·주기율 × 경과 ≤ 0.12 s),
   그림자 = LOD0만, LOD0가 있으면 장면 변경 → 그림자 캐시 갱신). `RenderService.loadCrowd(urls)`·`pedestrians.bindShared(buf)`, stats.crowd(lods 분포 포함).
3. **후처리 NaN 정리**(`post/pipeline.ts sanitize`): 노출 뒤·블룸/TAAU 앞에서 지수 비트가 모두 1인(NaN·Inf) 픽셀 → 0. 군중 근거리 시험 중 freecam이 서 있는 아바타 머리 안에서
   화면 전체가 검게 나오는 것을 재현 — 블룸 끔 = 정상(검은 픽셀 0.2 %), 켬 = 전체 검정. M06 사전 3(ADR-0059)의 원래 증상의 근본 원인.
4. **content/sim = JSON**(`content/sim/crowd.json`): 10 §의 `*.yaml` 대신 — YAML 파서 의존성 없이 Vite·Node가 바로 읽는다. game이 읽어 sim·render에 넘긴다(sim은 콘텐츠 경로를 모름).
5. 게임: `?crowd=dummy`일 때 첫 표시 뒤 워커 시작 → bindShared → loadCrowd(≈ 3.9 MB). 기본 = 군중 없음(실제 군중 = T03 이후).
6. **편차**: 임포스터 스프라이트는 T04(원경 밀도 스프라이트)로 미룸 — LOD3(260–920 삼각형)으로 250 m까지 그리고 비용이 예산 안. 소지품(가방·우산) 메시는 T04 appearance —
   T01은 휴대폰 클립(phone)·밝기 ±8 %·키 ±5 % 변형만.

## Consequences
- 군중 팩: bin 2.2 MB + ktx2 1.7 MB(12층 1024² ETC1S), 베이스 4.4–6.2k 정점, LOD 7.3–9.2k / 2.4k / 0.8–0.9k / 0.26–0.92k 삼각형(여성 베이스 LOD3는 머리털 이음매로 단순화 한계), 클립 472프레임.
  적재 3.6–5.5 s(첫 표시 뒤, 디코드 + 선컴파일). sim 틱 0.1–0.5 ms(최대 2.4 ms) — 더미 1,000명.
- **GPU 측정**(RTX 3050 Laptop, Chrome WebGPU, 2560×1440 High, 렌더 스케일 0.85 고정 `dynres=0`, 수직 동기 해제, 군중 켬 − 끔 rAF p50, 행마다 전력 상한):

| 시점 | 전력 | 보이는 수(LOD0/1/2/3) | 끔 p50 | 켬 p50 | Δ | 판정 |
|---|---|---|---|---|---|---|
| 지상 1.7 m(원 안) | 30 W | 195 (1/9/43/142) | 23.97 | 25.80 | 1.83 ms | ✅ |
| 지상 1.7 m | 30 W | 193 | 23.93 | 25.12 | 1.19 ms | ✅ |
| 지상 1.7 m | 30 W | 195 (0/11/42/141, LOD0 없음 — 그림자 갱신 없음) | 17.59 | 18.54 | 0.95 ms | ✅ |
| 상공 50 m·아래 57° | 30 W | 472 (0/0/69/403) | 15.85 | 18.19 | 2.34 ms | ✅ |
| 상공 50 m | 30 W | 468 | 16.28 | 16.60 | 0.33 ms | ✅ |
| 상공 50 m | 15 W | 469 | 41.12 | 41.99 | 0.87 ms | (참고) |

  잡음: 측정 중 전력 상한이 30 ↔ 15 W로 바뀌면 같은 장면이 2–3배(그 회차 제외). LOD0가 시야에 있으면 그림자 캐시가 매 프레임 갱신된다(정지 카메라에서도 —
  `stats.triangles`에 그림자 패스 +1.5 M로 보임). 걷는 카메라에선 원래 매 프레임 갱신이라 추가 비용이 작다.
- WebGL2(SwiftShader) e2e에는 군중 없음(기본 끔). 군중 셰이더는 textureLoad(정수 좌표) — WebGL2 texelFetch로 동작 예상(실제 확인은 T03 기본 켬 때).
