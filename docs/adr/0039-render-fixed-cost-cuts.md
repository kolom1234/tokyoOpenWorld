# ADR-0039: 렌더 고정 비용 절감 — 그림자 티어·격 프레임 갱신, 저해상도 공중원근, 파사드 깊이 프리패스, HLOD 불투명 변형 (M03 보강 2)
- Status: Accepted
- Date: 2026-09-30

## Context
목표: 이 PC(LG gram 17 17ZD90R, RTX 3050 4GB Laptop)에서 1080p Medium 60 fps, 1440p High는 RTX 3060급 기준(07 §10 ≤ 12 ms).
M03 결과(ADR-0035·0036): 공중원근 ≈ 6 ms·TAAU ≈ 8 ms(1440p) 고정 비용, 그림자 4 캐스케이드 매 프레임 재렌더, 파사드 ≈ 6 ms, 스폰 3.6 M 삼각형(그림자 포함).

측정 환경 주의(이번 세션 실측):
- **GPU 전력 상한이 15 W ↔ 30 W로 바뀐다**(nvidia-smi `enforced.power.limit`, 기본 30 W·최대 45 W, Windows 전원 모드 = 최고 성능). 15 W에선 클럭이 ≈ 420–500 MHz(최대 2100)라
  같은 장면이 2배 느리다. 지속 부하에선 15 W로 떨어지는 일이 잦다 → **15 W를 기준**으로 판정하고, 모든 표에 행마다 상한을 기록한다.
- WebGPU 타임스탬프 합은 실제 프레임의 ≈ 1/4(클럭 비율과 비슷) → **비율(패스별 비중)** 로만 쓰고, 절대값은 수직 동기·프레임 제한을 끈 Chrome의 rAF 간격 p50.
- GPU 타이머에 패스별 분해 추가(`stats().gpu.passes` — 프레임 안 렌더 호출 순번별, 이름 = 씬·그림자·후처리 쿼드).
  1080p Medium(15 W) 비중: 씬 44 %, 공중원근 RTT 19 %, 그림자 15 %, TAAU 8 %, AO 6 %.

## Decision
1. **그림자 07 §9 티어**(`lighting/shadows.ts SHADOW_TIERS`): Low 2×1024·150 m, Medium 3×1536·300 m, High 4×2048·600 m, Ultra 4×4096·800 m.
   캐스케이드 수가 같으면 제자리(맵 크기·거리), 다르면 노드 교체 + 받는 머티리얼 `needsUpdate`(재컴파일 — 티어 변경 때만).
2. **캐스케이드 갱신 스케줄**(`cascadeDue`, renderPrep에서 `shadow.needsUpdate`): 움직일 때 c0 매 프레임 + 먼 캐스케이드는 프레임당 하나(n ≤ 3 홀짝, n = 4는 c1 홀수·c2/c3 4프레임마다),
   카메라·장면 정지(위치 1 mm·방향 ≈ 0.01° 미만, 셀·HLOD 표시 변경 없음)면 15프레임마다 하나씩(태양 이동 추적), 원점 재설정은 전부.
   건너뛴 캐스케이드는 마지막으로 그린 맵 + 그때의 `shadow.matrix`를 쓴다(three ShadowNode는 갱신 때만 행렬 갱신 → 조회 일관).
3. **저해상도 공중원근**(`post/aerial.ts`, `PostEffects.aerial` 'half' — Low·Medium·High, Ultra = 'full' takram):
   렌더 스케일의 ½×½에서 MRT 한 패스로 산란 S(+ viewZ)·투과 T(takram `getIndirectLuminanceToPoint`, 하늘 텍셀 = `getIndirectLuminance` 시선 방향) →
   렌더 스케일에서 깊이 인지 2×2 업샘플(이웃 viewZ가 8 % + 2 m 넘게 다르면 가중 0, 모두 0이면 가장 비슷한 깊이) → (color 또는 하늘이면 태양·달 원반) × T + S.
   태양·달 원반(SunNode·MoonNode)은 작아서 저해상도면 사라진다 → 렌더 스케일에서. 지구 곡률 보정은 336 km 밖에서만 작동 → 생략.
   화질: 요요기 300 m full 대비 평균 |Δ| 0.375(같은 설정 두 번 캡처끼리 0.211), 서신주쿠 0.118, 태양 원반 유지.
4. **파사드 깊이 프리패스**(cell-node `prepassTwin`): 건물 파사드 메시마다 같은 지오메트리의 깊이 전용 쌍둥이(`colorWrite=false`, `renderOrder −1`, 그림자 없음)를 먼저 →
   파사드·지면은 보이는 픽셀만 셰이딩. 15 W 주택가 21.3 → 16.7 ms(단색 파사드 19.7보다 빠름 = 겹침 셰이딩이 컸다), 스폰 −2, 서신주쿠 −1, 요요기 상공 0.
5. **HLOD 불투명 변형**: HLOD 머티리얼이 항상 alphaHash(discard)라 깊이 쓰기가 늦어 원경 겹침이 비쌌다 → 머티리얼 ID × {불투명, 페이드} 2개,
   페이드(0 < f < 1) 중인 셀만 디더 변형(`CellSet.syncHlodMaterials`, renderPrep). 완전 숨김(0)은 두 변형 모두 정점 붕괴. 선컴파일에 두 변형 + 프리패스 추가.
6. **채택 안 함**: TAAU 경량화(Medium 이하) — three TAAUNode는 해석 식을 바꿀 옵션이 없고(패치 필요), 1080p Medium 비중 ≈ 12 %라 동적 해상도로 흡수.
   L0 반경 축소(HLOD 우선) — 프리패스·HLOD 불투명으로 원경 비용이 줄어 보류(streaming `l0RadiusScaleByTier` Medium 1.0 유지).

## Consequences
- 결과 표(회전 0.1°/프레임, 1080p Medium / 1440p High, 행마다 전력 상한): PR 본문·PROGRESS에 기록.
- 그림자: 정지 화면은 그림자 패스가 거의 0, 움직일 때 c0 + 하나. 먼 캐스케이드 경계는 1–3프레임 늦게 따라온다(빠른 비행에서 원거리 그림자 가장자리가 잠깐 비어 보일 수 있음).
- WebGPU 타임스탬프 절대값 불신(전력 상한·클럭) → `pnpm perf` 하네스(M02-T07 이후)는 rAF p50 + 전력 상한 기록을 기본으로.
- 새 `stats().shadows`(cascades·mapSize·maxFarM·이번 프레임 갱신 수), `stats().gpu.passes`.
