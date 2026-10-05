# 골든뷰 (M03-T10)

고정 시점 스크린샷으로 렌더 변화를 눈·SSIM으로 비교한다. 14-testing-perf §3.

- 북마크: `views.json` — `eyeWF`/`lookWF`(WF 절대, TP m), 선택 `eyeAglM`/`lookAglM`(지면 기준, 부팅 대기 뒤 L0 높이장),
  `fovDeg`, `time`(JST ISO), `weather`, `seed`. `core: true` 4장 = M03 태스크마다 before/after.
- 게임: `?view=<id>`(+ `world=local`) → 해당 시점에서 부팅 대기(384 m L0) → 포즈 고정 →
  스트리밍 큐·HLOD 페이드·추가 조건(머티리얼·나무·간판·군중 팩 + 처음 채우기 — M06-T07)이 1.5 s 조용하면 `#app[data-golden=ready]`. 핸들 `globalThis.__SANPO_GOLDEN__`.
  시각·날씨는 sim 시계(M03-T03)가 생기면 적용한다(그 전에는 고정 태양).
- 캡처: 실제 GPU Chrome(`channel: 'chrome'`, headed), 2560×1440, DPR 1. CI에서는 돌리지 않는다(GPU 없음).

```bash
pnpm golden                                   # core 4장 → test-results/golden/latest/*.png + metrics.json
GOLDEN_SAVE=M03/T04 pnpm golden               # docs/screenshots/M03/T04/<id>.jpg(1920×1080 JPEG q0.85)도 저장
GOLDEN_REPEAT=1 pnpm golden                   # 새 컨텍스트로 두 번 캡처 → SSIM ≥ 0.99(동일 머신 재현성)
GOLDEN_BOOT=1 pnpm golden                     # 스폰 부팅 첫 표시까지 전송 MB(world/materials/other)
GOLDEN_VIEWS=all|id1,id2  GOLDEN_LABEL=name   # 대상·출력 폴더
GOLDEN_QUERY='quality=high&gpuTiming=1'       # 추가 URL 쿼리
GOLDEN_BASE_URL=https://tokyo-sanpo-staging.kolom1357.workers.dev GOLDEN_WORLD=api pnpm golden   # staging(실제 배포 월드)
```

- `test-results/golden/baseline/<id>.png`가 있으면 metrics.json에 `ssimVsBaseline`을 기록한다(기준 교체는 파일 복사).
- 로컬 dev 서버 전송량은 번들 안 된 JS 모듈이 섞인다 → 예산(60 MB) 판정은 staging `GOLDEN_BOOT=1` 값으로.
- SSIM: `ssim.ts`(8×8 창·보폭 4, Rec.709 휘도). 단위 테스트 `ssim.test.ts`(vitest 프로젝트 `golden`).
