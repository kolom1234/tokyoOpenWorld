# ADR-0095: 포토 모드 — freecam·시계 정지, render 노출·DOF·고해상도 캡처, UI 그레이딩 합성
- Status: Accepted (M10-T05)
- Date: 2026-10-18

## Context
- 12 §5: 진입 시 시뮬레이션 일시정지, 자유 카메라 + 파라미터(시간 ±12 h·날씨·노출·WB·FOV 14–200 mm·조리개·초점(클릭)·LUT·비네팅·그레인·3분할·HUD 숨김), `render.screenshot({scale: 1|2})` → PNG + 도감 사진(썸네일). 07 §7: DepthOfFieldNode, 노출·WB 수동.
- 수락: 4K(2×) 캡처 성공, 캡처 중 메모리 급증 후 회수 확인. 평소 프레임 비용을 늘리면 안 된다.

## Decision
1. **진입**(P·일시정지 메뉴): walk·freecam에서만(탈것·열차는 안내). walk면 지금 카메라 자세로 freecam, 시계 frozen, 날씨 보관. 포토 화면은 "게임 중" 화면(입력 켜짐 — WASD·E/Q·끌기로 구도, 패드 스틱). 나가면 걷던 몸 자리로 walk(returnToBody), 시계(custom = 그 시각부터)·날씨·FOV 복원.
2. **render API**: `setPhoto({exposureEv, dof|null})` — 노출 = 후처리 HDR에 곱하는 유니폼(재컴파일 없음), DOF = `DepthOfFieldNode`(takram depthToViewZ — 역-Z)를 **포토 모드에서만** 후처리 그래프에 넣는다(켜고 끌 때 `rebuildPost` 1회 — 평소 비용 0). `screenshot({scale, settleFrames 8})` — 다음 프레임부터 픽셀 비율 × scale로 8프레임(TAAU 수렴) 그리고 마지막 프레임 렌더 직후 같은 작업에서 `canvas.toBlob`(호출 시점 그림), 다음 프레임 원래 크기. 캡처 중엔 품질 관리자가 프레임 시간을 세지 않는다(티어 강등 방지).
3. **파라미터 → 게임**: 초점 거리 mm → 수직 FOV(35 mm 환산 센서 높이 24 mm), 조리개 f/1.4–11 = DOF(초점 깊이 = 초점 × f/8, 보케 = 4/f), f/22 = 끔, 초점 = 슬라이더 또는 **오른쪽 클릭**(화면 점 → 카메라 광선 → 물리 레이 거리), 날씨 프리셋 = weather-climate 상태(`applyWeatherSpec`), 시간 = 진입 시각 ± h.
4. **그레이딩은 UI**(`photo/grade.ts`): 화이트밸런스(곱하기 색조)·비네팅(방사형)·필름 그레인(결정론 잡음 타일 — core rng) — 미리보기 = 같은 값의 CSS 층, 저장 = 원본 PNG를 OffscreenCanvas에 합성(원본 비트맵 즉시 close·큰 캔버스 1×1로 놓기). 3분할 안내선은 미리보기만.
5. **저장**: 그레이딩 PNG 다운로드 + 썸네일 JPEG(가로 360) → 게임 `storePhoto` → 카메라 250 m 안 가장 가까운 **발견한** 명소에 연결(도감 상세 사진 칸). 썸네일 영구 저장은 세이브(T06, IndexedDB).
6. LUT 선택·모션 블러·군중만 계속 옵션은 범위 밖(⚠️).

## Consequences
- 실제 GPU(RTX 3050 Laptop): 1920×1080 창 ×2 = **3840×2160 PNG 4.2 MB, 11.9 s**(수렴 8프레임 + PNG 인코딩), GPU 메모리 2083 → 최고 2839 MB(+756) → 6 s 뒤 2130 MB(+47) — 회수 ✅. 1600×900 ×2 = 3200×1800, +561 → +38 MB.
- ⚠️ DOF 켜고 끌 때 후처리 재구성으로 셰이더 컴파일 정지(측정 4.8 s 1회). 대안: 포토 모드 진입 때 미리 DOF 그래프를 만들어 두기(조리개를 바꿀 때마다가 아니라 진입 1회).
- Esc로 포토 모드를 닫을 때 같은 Esc가 일시정지를 여는 누수 → HUD로 막 돌아온 프레임은 단축키를 건너뛴다.
