# ADR-0027: 공유 머티리얼 라이브러리 — KTX2 배열 크기·지연 적재·셰이더 규칙 (M03-T01)
- Status: Accepted
- Date: 2026-09-29

## Context
07 §4는 `shared/materials`의 KTX2 배열(albedo/normal/ORM) 1024² 레이어를, 14 §2는 초기 다운로드 ≤ 60 MB를 정했다(M03 시작 시 staging 59.8 MB).
32개 CC0 재질(ambientCG)을 1024² 3장 모두로 인코딩하면 albedo ETC1S 6.3 MB + normal UASTC 29.2 MB + ORM UASTC 20.3 MB = **55.8 MB**였다.

## Decision
1. **원천**: ambientCG 1K-JPG zip(CC0) 32종 — 목록 `content/materials/library.json`(레이어 순서 = 배열 인덱스, 끝에만 추가), zip sha256은 `data/sources.lock.json`
   `ambientcg.sha256`(파일별 맵, `--update-lock`일 때만 기록), 출처는 `content/ATTRIBUTION.json` `ambientcg-<asset>`(자산마다). 유리는 텍스처 없이 절차 셰이더(T05).
2. **크기**: albedo **1024²** ETC1S(sRGB, qlevel 255) / normal·ORM **512²** UASTC(RDO λ 1.0/2.0 + zstd 19), 모두 밉맵. 결과 **18.0 MB**(6.3 + 7.0 + 4.7),
   GPU(BC7 트랜스코드) 67.1 MB ≤ 400 MB. 512² 근거: 2.5 m 타일에서 ≈ 5 mm/texel — 보행 시점에서도 법선·거칠기 디테일은 충분, 다운로드는 1/4.
3. **지연 적재**: 첫 표시(스폰 whenReady) 뒤 `render.loadMaterials(world.json files.materials)` → 초기 다운로드 예산에 들어가지 않는다. 텍스처 전에는 manifest의
   레이어 평균색(`avgColor`·`avgOrm`)으로 그린다. 픽스처(world-mini)는 텍스처 없음.
4. **재컴파일 없는 교체**: 셰이더는 부팅 선컴파일 때 1×1 자리표시 `DataArrayTexture`로 만들고, 적재 후 `TextureNode.value`만 바꾼다(바인딩 형식 동일).
   **자리표시에도 최종과 같은 샘플러 필터(LinearMipmapLinear·이방성 8)**를 준다 — three는 텍스처 필터로 샘플러를 고르므로 다르면 교체 후 LOD가 어긋날 수 있다.
5. **셰이더 규칙**: 그룹 → 레이어 범위는 uniform 배열(`MATERIAL_GROUPS` 13종 고정 순서, 파이프라인 group 이름과 1:1 — `materials.test.ts`가 대조).
   건물 해시는 `_bldg`(≤ 65535)만 varying으로 넘기고 프래그먼트에서 반올림 → 셀 시드(per-object uniform, 0..4095)와 **uint로 결합**한다.
   큰 float(시드 × 65536)를 varying으로 보간하면 삼각형 안에서 값이 흔들려 픽셀마다 다른 레이어·타일 크기가 골라져 심한 노이즈(미분 폭주)가 생긴다(실측).
6. **도구**: 파이프라인 이미지에 KTX-Software 4.4.2(deb, sha256 고정) + ImageMagick(apt, ORM 채널 패킹). 결과 캐시 `data/derived/materials/<hash>`
   (library + 인코더 인자 + toktx 버전), `--build-id`면 `data/build/<id>/shared/materials/`로 설치 → publish가 함께 올린다. validate가 manifest 스키마·크기·KTX2 헤더를 검사.

## Consequences
- 32레이어 인코딩 ≈ 2.5 min(캐시 후 0 s). 레이어 추가 = library.json 끝에 추가 + `--update-lock` + 재인코딩(해시가 바뀜).
- normal·ORM 512²가 근접 매크로 촬영(포토모드)에서 부족하면 해당 그룹만 1024² 두 번째 배열로 분리(ADR 갱신).
- 금속면은 환경 반사(M03-T02) 전까지 금속도 상한 0.3(검게 보임 방지) — T02에서 해제.
