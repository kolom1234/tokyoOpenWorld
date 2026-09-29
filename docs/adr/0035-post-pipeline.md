# ADR-0035: 후처리 파이프라인 구성과 품질 티어 조정 (M03-T07)
- Status: Accepted
- Date: 2026-09-29

## Context
07 §7은 MRT → GTAO → SSGI → SSR → 대기 → Bloom → 자동 노출 → TRAA/TAAU → AgX → LUT → Sharpen을, 07 §9는 High = GTAO + SSGI(½) + SSR,
렌더 스케일 0.85를 정했다. 수락 기준은 "1440p High 후처리 합계 ≤ 4 ms"(RTX 3060급). three r186 표준 노드(GTAO·SSGI·SSR·Bloom·TRAA·TAAU·Lut3D·Sharpen)로 구성했다.

## Decision
1. **순서**(07 §7에 반영): MRT(output · normal+roughness · velocity · [diffuse+metalness], 24 B/샘플 — 따로 두면 40 B로 WebGPU 기본 한도 32 B 초과)
   → GTAO 또는 SSGI 합성 → SSR 가산(비금속 포함 — 유리·젖은 노면) → aerialPerspective → 자동 노출 → Bloom(¼) → TRAA(스케일 1) / TAAU(< 1)
   → renderOutput(AgX·sRGB) → LUT → Sharpen. TAAU 전 단계는 렌더 스케일 해상도 RTT(`resolutionScale` 옵션).
2. **자동 노출**: 컴퓨트 1회/프레임(32² 격자 로그 평균, 하늘 제외, EMA τ 0.8 s, 스토리지 버퍼 — CPU 왕복 없음), **부분 적응**
   (0.12 / 평균)^0.4 ∈ [0.5, 4]. 완전 적응은 그늘진 골목을 8배로 밝혀 기각.
3. **LUT**: 절차 32³(외부 .cube 없음 — 라이선스 무관). 시간·날씨 LUT는 M08.
4. **티어**(실측 기반): Low 0.6(AO 없음) / Medium 0.75(GTAO) / High 0.85(GTAO + SSR + Bloom) / Ultra 1.0(SSGI + SSR + Sharpen).
   **SSGI는 Ultra만** — r186 SSGINode는 해상도 배율이 없고 1440p에서 +100 ms 이상(07 §9 High의 SSGI(½)에서 이탈). Sharpen은 2.2 ms라 Ultra만.
   GTAO는 반경 0.5 m·8표본 + 시간 누적(반경 1 m는 +2 ms).

## Consequences
- 1440p RTX 3050 Laptop(무제한 프레임 p50, 스크램블): 모두 끔(스케일 1) 25.9 ms → High 35.9 ms(주택가 30.1 → 38.6). High 안 빼기 실측:
  GTAO 3.5 · Bloom 3.0(½, 이후 ¼로) · Sharpen 2.2 · SSR 1.6 · 노출 0.6 · LUT 0.5 ms, 공중원근 자체 ≈ 6 ms, TRAA ≈ 8 ms.
  RTX 3060 환산(≈ 2.2배) High 순증 ≈ 4.1–4.5 ms, 공중원근 포함 후처리 ≈ 7 ms → **수락 기준(≤ 4 ms) 미달**. T08 동적 해상도로 프레임 예산을 지키고,
  공중원근(takram) 비용·TRAA 대체(더 가벼운 TAA)는 후속 과제.
- 이 GPU의 timestamp 합산(gpu-timer)은 패스·컴퓨트가 많아지면 신뢰도가 떨어져(SSGI 158 ms 등 튐) 후처리 비교는 무제한 프레임 p50으로 쟀다.
- 밤(21:00)에는 실내 발광 × 노출 배율(≈ 2.9)로 창이 켜진 듯 보인다 — 실제 야간 점등 규칙은 M09.
