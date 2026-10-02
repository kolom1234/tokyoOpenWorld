# ADR-0057: 군중·플레이어 캐릭터 = Microsoft Rocketbox(MIT), 리그 23뼈 + 뼈 팔레트 텍스처(VAT 대신)
- Status: Accepted (ADR-0048 Quaternius 아바타를 대체 — M06 사전 결정 1, 사용자 2026-10-02)
- Date: 2026-10-02

## Context
사용자 결정(2026-10-02): Quaternius 유료 Source는 사지 않는다. 목표가 사실적 표현이므로 Microsoft Rocketbox Avatar Library를 먼저 검토하고,
적합하면 플레이어 아바타도 같은 계열로 바꾼다. 부적합하면 근거와 다른 무료·허용 라이선스 대안을 낸다.

검토 결과(저장소 `microsoft/Microsoft-Rocketbox`, 커밋 `0943055db6ec570bcef9f2c8b41c9e5467c808f9` 2022-10-02):
- **라이선스**: `LICENSE.md` 원문 = MIT License, "Copyright (c) 2020 Microsoft"(README "12/2020: Updated license to MIT"). GitHub API 판정도 `mit`.
  상업·재배포·수정 허용, 조건은 저작권·허가 고지 포함뿐 → 게임 배포물에 고지 파일을 싣는다(아래 4).
- **구성**: 아바타 115종(Adults 40 = 여 19·남 21, Professions 73, Children). 아바타마다 `Export/<이름>.fbx`(+ `_facial.fbx`) 1개, 텍스처 2048² TGA
  (body·head 각 color·normal·specular + 머리털 `opacity_color` RGBA). 애니메이션 417개(`Assets/Animations`, FBX) — **모두 같은 3ds Max Biped 골격**.
- **폴리곤**(three FBXLoader로 실측): 저장소 FBX에는 README가 말한 hipoly·midpoly·lowpoly·ultralowpoly 중 **hipoly 1단계만** 있다
  (`m002_hipoly_81_bones_opacity`). 스킨 메시 1개, 머티리얼 3(몸·머리·머리털), 뼈 81(얼굴 31 + 손가락 30 포함), cm·Y 위·정면 +Z.
  삼각형: Male_Adult_01 7,440 · Male_Adult_10 6,732 · Female_Adult_01 8,732. 용접 뒤 정점 ≈ 4.1k.
- **LOD**: 원본 1단계뿐 → meshopt `simplifyWithAttributes`(위치 + 법선 0.5 + 아틀라스 UV 2)로 만든다. Male_Adult_10 실측 6,732 → 2,399 → 800 → 258.
  같은 정점 버퍼를 공유하는 인덱스 LOD라 뼈 가중치·UV가 그대로 쓰인다.
- **VAT 굽기 가능 여부**: 기술적으로 가능(어떤 스킨 메시든 프레임별 정점 위치를 구울 수 있다). 그러나 정점 4k × 클립 합 ≈ 470프레임 × 8 B(RGBA16F)
  ≈ **15 MB/베이스, 12종 ≈ 180 MB**(법선 별도)라 예산 밖. 반면 모든 베이스가 같은 Biped 골격이라 **뼈 팔레트 텍스처**(프레임 × 뼈마다 회전 사원수 + 이동,
  RGBA16F 2텍셀)는 23뼈 × 470프레임 × 16 B ≈ **173 KB/베이스, 12종 ≈ 2 MB**. 정점 셰이더 표본 = 영향 4 × 2텍셀(군중 정점 수가 작아 비용 무시 가능).
- **사실성**: 실사 사진 기반 텍스처(얼굴·옷 주름), 성인 체형이 자연스럽다(Quaternius 무료판 Superhero 근육질 문제 해소). 동아시아계 얼굴 다수 포함.

## Decision
1. **채택**: Rocketbox를 군중 베이스와 플레이어 아바타에 쓴다. 목록 = `content/characters/catalog.json`(커밋 고정, 수정 가능한 콘텐츠).
   - 군중 12종(남 6·여 6, 평일 도심 = 정장 비중): Business_Male_01·02·03·04, Male_Adult_08·01, Business_Female_01·03, Female_Adult_02·03·05·11. 선택 가중치 포함.
   - 플레이어 = Male_Adult_10(빨간 트랙 재킷 — 3인칭 뒷모습 식별). 군중에는 넣지 않는다(분신 방지).
   - **로고 검사**(기본색 텍스처 육안, 2048²): 실제 상표·브랜드 로고 없음. Male_Adult_09는 티셔츠 문구 프린트("END OF THE ROAD")라 **제외**,
     Female_Adult_12 후디의 헤드폰 그림·Male_Adult_06 밑단 삼각 표시는 일반 그래픽(이번 12종에는 미포함). 운동화는 무지 일반형.
2. **리그 23뼈**(`RIG_BONES`: Bip01 + 골반·척추 3·목·머리·쇄골·위팔·아래팔·손 ×2·허벅지·종아리·발·발가락 ×2, 계층이 닫힘).
   얼굴 뼈 가중치 → 머리, 손가락은 같은 성별 걷기 클립 첫 프레임의 **편 손 자세를 메시에 구운 뒤** 손으로 합친다(T자 손가락 방지, 뼈 수 81 → 23).
   가중치 = 리그 번호별 합 상위 4개, u8 합 정확히 255.
3. **클립**: 클립 골격의 리그 뼈 로컬 회전만 아바타 골격에 얹고(뼈 길이 = 아바타 휴지값), Bip01 높이는 휴지 높이 비율, 전진(루트 모션)은
   선형 성분을 빼 제자리로 만들고 자연 속력(m/s, × 높이 비율)을 기록. 11–34 s 대기 클립(idle·phone)은 6 s + 끝 0.5 s 교차 혼합으로 이음매 없이 자른다. 30 fps 표본.
   군중(성별별) = walk(neutral_01)·walk_slow·walk_fast·idle(neutral_01)·phone(textmessage). 플레이어 = idle·walk(= walk_fast_01, 1.50 m/s)·jog(run_slow_01, 2.56)·sprint(run_fast_01, 6.81).
4. **텍스처**: 몸·머리·머리털을 정사각 아틀라스 사분면에(위→아래 행 UV), UV 덮임 마스크 가중 상자 축소(검은 배경 번짐 방지) + 덮임 밖 8텍셀 번짐 채우기,
   머리털만 알파. KTX2 ETC1S sRGB(밉맵) — 플레이어 2048² 1장(부위 1024²), 군중은 층 1024²(부위 512²) 배열(M06-T01).
   렌더: `MeshStandardNodeMaterial` 기본색 = 텍스처, 불투명도 = 텍스처 알파 × 공용 opacity(alphaHash 디더 — TAAU가 다듬음). KTX2Loader는 머티리얼 라이브러리와 공유(`library.ktx2()`).
5. **파이프라인** `pnpm pipeline characters [--only player|crowd] [--update-lock]`(컨테이너 전용 — toktx): 원천이 없으면 `raw.githubusercontent.com/<repo>/<commit>/…`에서 받고
   `sources.lock` `rocketbox`의 **저장소 상대 경로별 sha256**으로 검사. FBX는 three `FBXLoader`(Node, 텍스처 적재 막음), TGA는 자체 디코더.
   산출 = `apps/game/src/assets/characters/`(게임 해시 에셋, 커밋) — 플레이어 `avatar-rb.glb`(스킨 GLB, 리그·클립·씬 extras `sanpoAvatar` v2) + `avatar-rb.ktx2`.
6. **MIT 고지**: `apps/game/public/third-party-notices.txt`(사이트 루트 `/third-party-notices.txt`)에 Rocketbox 저작권·허가 고지 전문. `ATTRIBUTION.json` 항목 `rocketbox`.
   M08 크레딧 화면이 이 파일을 잇는다.
7. Quaternius(ADR-0048) 단계·GLB·lock·ATTRIBUTION 항목은 삭제(배포물에서 빠짐). `lib/zip.ts`는 남긴다(PLATEAU fetch 후보).

## Consequences
- 플레이어 아바타: 4,109정점·6,732삼각형, GLB 333 KB + KTX2 477 KB(Quaternius 709 KB 대비 +0.1 MB, 첫 표시 뒤 적재). 실제 GPU(RTX 3050 Laptop, WebGPU) 3인칭 정지·걷기 확인.
- 군중 메모리: 뼈 팔레트 ≈ 2 MB(12종), 메시 4 LOD 공유 정점, 텍스처 배열 12층 1024² ETC1S(M06-T01에서 실측).
- 리그 23뼈라 손가락·얼굴 표정 애니메이션은 없다(편 손 고정). 근거리 대화 연출이 필요하면 손가락 뼈를 리그에 다시 넣는다(정점 셰이더 표본은 그대로 4영향).
- 계단·우산 걷기 클립은 Rocketbox에 없다(우산은 idle만) → 비(M09) 때 우산 소품을 손 뼈에 붙이는 방식 검토.
- 대안(부적합 판단 시 후보였던 것): MakeHuman(CC0 베이스·에셋, 체형 생성기 — 텍스처·의상 제작 비용 큼), Mixamo(Adobe 약관상 원본 재배포 불가 — 웹 배포 자산으로 부적합),
  VRoid·Ready Player Me(모델별 약관·애니메풍/서비스 종속), Quaternius 유료(사용자 거절).
