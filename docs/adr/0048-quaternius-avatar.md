# ADR-0048: 플레이어 아바타 = Quaternius UBC + UAL(CC0) 굽기 GLB, 정점색·옷 영역, 속력 블렌드 (M05 결정 2)
- Status: Accepted (ADR-0045 §4 "자체 절차 마네킹"은 모델 적재 전·실패 시 대체로 유지)
- Date: 2026-10-01

## Context
09 §3은 3인칭 아바타로 "Quaternius 베이스 아바타"를 정했고, 사용자가 Quaternius CC0 에셋 사용을 승인했다(2026-09-30).
03 §4 = Universal Base Characters(UBC) / Universal Animation Library(UAL) 무료판. 공식 배포 = quaternius.itch.io(무료, 가격 0 — Quaternius 본인 계정).
무료판 UBC Standard(128,968,391 B) = **Superhero 비율 남·여 2종**(Regular·Teen 비율은 유료 Source) + 머리털 8종, glTF·FBX, 기본색 2048² PNG(속옷 차림 베이스 메시).
UAL Standard(15,904,933 B) = 43클립, **UBC와 같은 65관절 골격**, 루트 모션판(_RM) 포함.

## Decision
1. 원본 zip은 `data/raw/quaternius-{ubc,ual}/`(커밋 안 함), `sources.lock.json`에 sha256. `pnpm pipeline avatar`(호스트 Node, `lib/zip.ts` 최소 ZIP 읽기)가 굽는다:
   - Superhero_Male_FullBody(몸·눈·눈썹) + Hair_SimpleParted(머리 뼈 리깅 — 관절 이름으로 재번호) → **프리미티브 1개·머티리얼 1개**.
   - 텍스처 대신 **정점색**(COLOR_0 u16): 기본색을 UV 쌍선형 표본(sRGB → 선형), 머리털은 회색조라 짙은 갈색을 곱함,
     몸은 **스킨 가중치로 옷 영역**(spine·clavicle·upperarm = 반팔 셔츠, pelvis·thigh·calf = 바지, foot·ball = 운동화 — 가중치 합 smoothstep 0.35–0.65)을 칠한다(로고·무늬 없음).
   - 클립 4개(Idle_Loop·Walk_Loop·Jog_Fwd_Loop·Sprint_Loop → idle·walk·jog·sprint): 회전 채널 그대로, pelvis 이동만 휴지 차이 보정, 크기·다른 이동 버림.
     자연 속력 = _RM의 root 이동 ÷ 길이 × (몸 키 ÷ 마네킹 키) → 씬 extras `sanpoAvatar { heightM, feetY, clips[] }`.
   - 가중치 u8 정규화(합 255). 결과 **9,240 정점·15,619 삼각형·709 KB**(`apps/game/src/assets/avatar-ubc-male.glb` — 커밋, Vite 해시 에셋 `/assets/*` immutable).
2. render `loadAvatar(url)`: GLTFLoader → 키 1.72 m·발 원점·정면 −Z(Y축 π) → MeshStandardNodeMaterial(정점색, 마네킹과 같은 opacity uniform·alphaHash 디더 페이드, 그림자) →
   `compileAsync` 뒤 마네킹 교체. 블렌드 = 게임 속력 매듭(idle 0·walk 1.35·jog 3.0·sprint 5.0 m/s) 이웃 두 클립 선형, 이동 클립은 **위상 공유**(발 박자),
   재생 속도 = 속력 ÷ 자연 속력(키 배율)을 [0.75, 1.6]으로 자름(과한 슬로모션 대신 약간의 발 미끄럼 — 3인칭 3.5 m에서 거의 안 보임).
3. game: 첫 표시 뒤 적재(초기 다운로드 밖), 실패 = 마네킹 유지. `WorldView.avatarSettled` → 오버레이 `data-settled`(e2e 안정 조건).

## Consequences
- 실제 GPU(RTX 3050 Laptop, WebGPU, world-mini): 첫 표시 뒤 ≈ 8.5 s(dev 서버, 선컴파일 포함)에 교체, 걷기·달리기 60 FPS 유지. 모델 = 드로우콜 1(+ 그림자).
- 초기 다운로드에는 포함되지 않는다(첫 표시 뒤 709 KB, gzip 전송 더 작음).
- **M06 군중 적합성**: 라이선스(CC0)·골격·클립(Walk_Formal·Idle_Talking·Sitting·Driving 등 43종)은 그대로 쓸 수 있다. meshopt 단순화 실측(이 GLB):
  4k 삼각형 오차 0.3 cm, 2k 0.7 cm, **1k 1.4 cm**, 500 4.8 cm → 군중 LOD 가능. 한계 = 무료판 체형이 Superhero 남·여 2종뿐(근육질) —
  옷 색·머리털 8종·피부 2톤 조합으로 변화를 주거나, 자연스러운 체형(Regular·Teen)은 유료 Source($20, 역시 CC0)가 필요 → **사용자 결정 사항**(M06-T0x 전에).
  스키닝 인스턴싱은 three WebGPU에 없어 군중은 VAT(정점 애니메이션 텍스처) 굽기 또는 LOD별 BatchedMesh 설계가 필요(M06).
