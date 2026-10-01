# ADR-0053: 랜드마크 오버라이드 = PLATEAU 셸 재머티리얼 + 절차 부품(meta.json) → overrides.mesh 단일 프리미티브(`_LMAT`) (M05-T05)
- Status: Accepted
- Date: 2026-10-01

## Context
M05-T05: 시부야역 일대(스크램블 스퀘어·마크시티 연결부) → 하치코 광장 → 스크램블 교차로 대형 비전(가상 영상) → 요요기 국립경기장 → 메이지 신궁 도리이·참도 → 도쿄도청 →
신주쿠역 서쪽 출구 광장. 수락 = PLATEAU footprint 위치 오차 ≤ 0.5 m, 높이 오차 ≤ 1 m, 로고·상표 없음.
04 §4.4-4·로드맵 Files는 `content/overrides/<gmlId>/{model.blend,model.glb,meta.json}`(수작업 Blender 모델)이었다. 이 저장소에는 Blender 작업 경로·검수자가 없고,
PLATEAU LOD2가 이미 랜드마크 형상(스크램블 스퀘어 5,700면, 마크시티 3,900면 등)을 담고 있다.

## Decision
1. **명세 = `content/overrides/<id>/meta.json`**(gmlId 대신 이름 디렉터리, 랜드마크 하나가 건물 여러 동·부품을 묶음): `replace`(대체 gmlId), `shell`(건물별 `cuts` 높이 + 규칙
   `{kinds?, wall?, y?, mat}` 첫 일치), `parts`(box·cyl·extrude·railing·ribbon·screen·torii·dog), `reference`(치수·위치 출처). glb 모델 파일은 쓰지 않는다(편차 — 04 §4.4-4 갱신).
2. **셸**: 대체 건물의 PLATEAU 렌더 면(roof·wall·installation)을 그대로 다시 낸다 → 위치·높이 오차 0(형상 = 측량). 벽은 `cuts`에서 수평으로 잘라(Sutherland–Hodgman) 띠별 머티리얼
   (포디움 유리·핀 커튼월·크라운 등). 벽과 같은 평면의 부속물은 buildings.mesh와 같이 뺀다. 대체 건물은 buildings.mesh **렌더에서만** 빠지고(`renderSkip`) 충돌·meta에는 남는다.
3. **부품**: 셀 로컬 절차 기하. 바닥 = 지형 메시 높이(+y) 또는 WF 절대(yAbs). 기준점(anchor)이 있는 셀이 낸다(화면은 붙는 건물이 있는 셀). `collide` 부품은 같은 삼각형을
   건물 충돌 스트림에 붙여 함께 단순화·청크(박스·원기둥 프리미티브 대신 — 물리 워커에 볼록 껍질이 없음). 벽 화면 = 가장 가까운 PLATEAU 벽 평면과 평행, 0.02–0.3 m 금속 함 + 안쪽 화면 면.
4. **overrides.mesh**: glb 프리미티브 1개(머티리얼 `landmark`), POSITION u16(노드 양자화)·NORMAL i8·TEXCOORD_0 f32(미터: 벽 = 수평 거리·건물 바닥부터 높이, 수평면 = x·z, 화면 = 시드 × 1000 + m)·
   `_LMAT` u8(15종 — 콘크리트·석재·커튼월·투명 유리·금속·데크·목재·주홍·화면·청동·짙은 강판·화강암 창 격자·자갈·핀 커튼월·녹지). cells.idx flags bit0 = 오버라이드 포함(05 §5).
5. **렌더 `landmark` 머티리얼**(선컴파일 1개): `_LMAT` → uniformArray 색·거칠기·금속도 + 종류별 절차 무늬(fwidth 거리 평균 선 — 멀리언·핀·줄눈·창 격자, 노이즈 자갈·나뭇결·청동 녹).
   화면 = 가상 영상(시드·9 s 장면별 색상 쌍, 움직이는 원·흐르는 띠·LED 격자, **글자·로고 없음**), 발광 배율 `screenExposure`.
6. **수락 검사**(빌드 시): 대체 건물마다 셸 + 붙은 부품 경계 vs PLATEAU 렌더 면 경계 — 수평 ≤ 0.5 m, 위 끝 ≤ 1 m, 넘으면 빌드 실패. PLATEAU 건물이 아닌 부품(도리이·동상·참도)은
   OSM 위치·높이 태그와 공개 치수(reference)를 그대로 쓴다.

## Consequences
- 수작업 모델 없이 측량 형상을 유지하면서 랜드마크 외관(머티리얼·부품)을 바꾼다. 세밀한 조형(곡면 지붕 케이블 등)은 PLATEAU LOD2가 가진 만큼만.
- L1 HLOD는 원래 PLATEAU 건물(facade 단색) — 원경에서는 차이 없음.
- 화면은 낮 발광 배율만(야간 점등·광원은 M09).
