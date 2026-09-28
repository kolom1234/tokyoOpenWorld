# ADR-0025: HLOD 자식 전환 렌더·streaming→render 적용 예산 (M02-T05)
- Status: Accepted
- Date: 2026-09-29

## Context
06 §5는 "자식 live → 부모 그룹 숨김, 0.3 s 디더 크로스페이드(alphaHash), 자식 해제 시 부모 먼저 보이기"를, 06 §6은 "프레임당 적용 ≤ 2 ms, onReady ≤ 2",
07 §3은 "셀당 draw L1 ≤ 8, L2/L3 ≤ 4"를 정했다. ADR-0024로 `hlod.mesh`는 머티리얼별 프리미티브 + 정점 `_CHILD`다.
정하지 않은 것: 자식별 표시를 셰이더에 어떻게 넘길지(머티리얼 공유·파이프라인 수), 부모보다 자식이 먼저 도착하는 경우, 숨김 자식의 비용,
GPU 업로드가 `addCell`이 아니라 다음 render에서 일어나는 점, 임시 로더(ADR-0020) 교체 방식.

## Decision
1. **셀별 페이드 16개 = per-object uniform**(TSL `uniform(vec4).onObjectUpdate`, 기본 objectGroup) × 4. 셀의 지형·건물 메시가 `userData.hlodFade`
   (Vector4 × 4)를 공유하고, HLOD 머티리얼은 머티리얼 ID당 1개(`registry.getHlod`) — 셀이 늘어도 파이프라인이 늘지 않는다. 셀당 draw 2.
   정점 `_child`로 원-핫 가중 `max(0, 1 − |child − k|)`·dot → 자기 페이드. `opacityNode = fade` + `alphaHash`(디더),
   `positionNode = position × step(0.001, fade)` → 완전히 숨긴 자식은 삼각형이 퇴화(래스터 0).
2. **`_CHILD` u8 → float32는 render가 addCell 때 변환**: three WebGPU에 1성분 8비트 정점 형식이 없다. 셀당 정점 수만큼 1회(L1 184k 정점 addCell 1.44 ms 포함).
3. **HlodSwitch**: `setHlodChildVisible(parent, i, false)` = 0.3 s 선형 페이드 아웃, `true` = 즉시 1(자식 제거 직전 호출 → 구멍 없음).
   부모가 아직 없으면 목표 상태만 기억했다가 붙을 때 페이드 없이 적용(도착 순서 무관). 모두 보이는 떨어진 부모 상태는 지운다.
4. **배선(`apps/game/src/wiring/streaming-render.ts`)**: phase 45 `setInterest(traversal.interest)`, phase 55 적용 — `addCell → ack('render') → 부모 자식 숨김`,
   해제는 `부모 자식 보임 → removeCell`, 적용 전 해제된 payload는 큐에서만 뺀다. 예산 = **시간 2 ms + 업로드 바이트 4 MiB/프레임**(첫 셀은 항상).
   바이트 예산을 둔 이유: GPU 업로드는 다음 render에서 일어나 시간 예산에 안 잡힌다 — 실측 비행 55 s에서 render > 4 ms 프레임 119 → 48, render p99 9.6 → 5.7 ms,
   rAF 간격 최대 50 → 18.3 ms(> 33 ms 프레임 4 → 0).
5. **선컴파일**: `render.precompile()` = 고정 머티리얼 ID × {기본, HLOD}를 실제와 같은 정점 형식의 더미 메시로 `compileAsync`(월드 표시 전 1회).
6. **임시 로더 삭제**(ADR-0020 후속): `debug/local-cells.ts`(메인 스레드 GLTFLoader) 제거 → `world-load.ts`는 world.json·cells.idx만,
   `world-view.showWorld`가 `createStreaming` + 배선 + `whenReady(스폰 384 m, L0)` — 384 m = 스폰 셀 안 어디서든 3×3 모서리(≤ 362 m) 포함.
7. **dev 전용 `?world=local`**: vite dev 미들웨어 `/local-world` → `data/build/<SANPO_LOCAL_BUILD | 최신>`. 빌드에는 포함 안 함(원천·빌드 데이터 비배포).

## Consequences
- 수락(신주쿠 400 m → 지상 급강하, 실제 GPU): 0.5 s 간격 19 샘플에서 지평선 아래 하늘색(구멍) 화소 0, 콘솔 오류 0, 60 FPS, 스크린샷 `docs/screenshots/M02-T05-shinjuku-*.png`.
- 페이드 중 0.3 s 동안 자식 L0와 부모 그룹이 겹쳐 그려진다(디더라 z-fight 대신 점묘). L0 자체의 페이드 인은 하지 않는다(모든 L0 머티리얼에 alphaHash 비용을 피함).
- 큰 L1 셀 하나(≈ 7 MB 업로드)는 여전히 그 프레임 render를 5–10 ms 늘릴 수 있다 → HLOD 셀 크기·업로드 분할은 perf(M02-T07 이후) 결과로 판단.
