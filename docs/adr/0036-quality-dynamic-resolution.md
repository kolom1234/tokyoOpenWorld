# ADR-0036: 품질 티어 초기 선택과 동적 해상도 (M03-T08)
- Status: Accepted
- Date: 2026-09-29

## Context
07 §9: 초기 티어 = detect-gpu + 60프레임 측정, 실행 중 동적 해상도(0.5–1.0, ±0.05)로 16.6 ms 유지, `quality/changed`. T07에서 티어마다 렌더 스케일을 두었지만
고정이었고, 첫 로드 예산(14 §2)과 CSP(connect-src 'self') 때문에 detect-gpu 기본 동작(unpkg에서 벤치마크 JSON)은 쓸 수 없다.

## Decision
1. **감지 시점·저장**: 첫 표시 뒤 `render.detectQuality()` — 벤치마크 JSON을 apps/game이 `/detect-gpu/`로 자체 호스팅(한 파일 ≤ 155 KB, 첫 로드 밖).
   detect-gpu 0–1 → low, 2 → medium, 3 → high(Ultra는 사용자 선택), WebGL2 상한 medium. 결과·이후 `quality/changed`는 localStorage에 저장, 다음 부팅은 저장값으로 시작.
   `?quality=`·골든뷰는 고정(감지·저장·강등 없음, 골든뷰는 동적 해상도도 끔 — 결정론).
2. **60프레임 측정 → 강등**: 티어 적용 뒤 60프레임마다 보되, 동적 해상도가 아직 내려가는 중이면 계속 지켜보고, 0.5 바닥에서도 EMA > 20 ms면 한 단계 내림(반복).
3. **동적 해상도 컨트롤러**: 수직 동기 60 Hz에서 dt는 여유가 있어도 16.7 ms라 여유를 직접 못 잰다 → 넘치면(EMA > 17.5 ms) 즉시 −0.05,
   17.1 ms 아래로 2 s 머물면 +0.05 시도, 시도 직후 넘치면 되돌리고 대기 2배(≤ 30 s). 스케일 적용 = PassNode·중간 RTT·GTAO·SSR `resolutionScale`만(재컴파일 없음)
   → **TAA는 항상 TAAU**(스케일 1에서도 — TRAA와 비용 비슷).
4. **버스**: render는 `quality/changed`를 받아 적용(같은 티어면 무시 — 되먹임 없음), 자기가 바꾼 것(감지·강등·setQuality)은 방출(streaming L0 반경 배율이 따른다).
5. 수락 확인용 `RenderConfig.debugGpuLoad`(`?gpuLoad=n`): 렌더 스케일 해상도에서 픽셀당 n회 삼각함수(결과 1e-9배로만 섞음).

## Consequences
- RTX 3050 Laptop 실측: detect-gpu tier 3 → High. 1080p Medium + `?gpuLoad=200`: 고정 0.75 = 22.4 ms → 동적 해상도 0.5에서 ≈ 16.7–18.6 ms(수직 동기 양자화·스트리밍 끊김 포함).
  1440p High는 0.5에서도 ≈ 23 ms — TAAU 해석·출력 변환 등 **해상도에 비례하지 않는 고정 비용(≈ 8 ms)** 때문 → 자동 흐름에선 60프레임 측정이 티어를 내린다.
- 티어 변경 = 후처리 재구성(셰이더 재컴파일 끊김 1회). 그림자 해상도·거리 티어화(07 §9 그림자 행)는 CSM 재생성이 필요해 아직 안 함(후속).
