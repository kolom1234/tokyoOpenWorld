# 12 — UI / UX (`@sanpo/ui`)

## 1. 원칙
- **미니멀 HUD**: 풍경이 주인공. 5초 무입력 시 HUD 자동 페이드(설정 가능).
- Preact + `@preact/signals`. 게임 상태는 `UiBridge`(apps/game이 구현)로만 읽고 쓴다 → ui는 다른 패키지를 import하지 않는다.
- 캔버스 위 DOM 오버레이. 3D 월드 렌더에 영향 없도록 HUD 갱신 10 Hz 스로틀.
- 폰트: Noto Sans JP/KR 서브셋 자체 호스팅. 다국어 ko/ja/en (`packages/ui/src/internal/i18n/{ko,ja,en}.json` + `t.ts`, 키는 `area.key` 형식).

## 2. 화면 목록
| 화면 | 내용 |
|---|---|
| Boot/Loading | 로고, 단계별 진행(월드 매니페스트 → 원경 → 스폰 지역 → 셰이더), 팁, WebGPU/격리 상태 표시 |
| Title | 이어하기 / 새 산책(시작 지점: 시부야 스크램블·하라주쿠·신주쿠 서쪽 출구 선택) / 설정 / 크레딧 |
| HUD | 좌상: 현재 지명(○○区 ○○町 ○丁目, e-Stat 경계) / 우상: 시각(JST)·날씨 아이콘·기온(실시간 모드) / 하단 중앙: 상호작용 프롬프트 / 우하: 미니맵(원형, 북쪽 고정·회전 선택) / 모드별: 속도계(차량), 다음 역(열차) |
| Map (M) | 전체 지도(`global/map.pmtiles` 자체 캔버스 렌더러), 발견 POI, 역, 현재 위치, 빠른 이동(발견한 역만), 레이어 토글(철도/지명) |
| Discovery Log | POI 도감: 카테고리(랜드마크, 거리, 공원, 신사·절, 전망), 설명(자체 작성 3개 언어), 발견 시각·날씨 기록, 사진 첨부(포토모드 연동) |
| Photo Mode (P) | §5 |
| Settings | 그래픽(티어, 렌더 스케일, 개별 토글), 카메라(FOV, 헤드밥, 감도, 반전), 조작 재바인딩, 오디오 믹서, 시간(실시간/사용자/배속), 날씨(자동/실시간/고정), 편의(차 부르기, 점프, HUD 페이드), 언어, 단위(km/h, mph) |
| Credits | `world/<buildId>/credits.json`(데이터·에셋 출처), ODbL 파생 DB 링크, `oss-licenses.json`(코드 라이선스) |
| Pause (Esc) | 재개, 지도, 도감, 설정, 타이틀로 |

## 3. 미니맵/지도 렌더러
- PMTiles(vector) → 자체 Canvas2D 렌더러(`src/internal/map/`): 레이어 순서 = 수면 → 공원 → 건물 풋프린트 → 도로(등급별 폭) → 철도 → 역 → 라벨 → POI.
- WF ↔ 지도 좌표 변환은 `UiBridge.worldToMap()` 사용(ui가 geo를 직접 import하지 않음).
- 하단 상시 표기: `© OpenStreetMap contributors, 国土交通省 PLATEAU, 国土地理院` (크레딧 링크).

## 4. 세이브
- IndexedDB(`idb-keyval`) 키: `save/v1` = `{ posWF, yaw, mode, discovered: string[], photos: PhotoMeta[], stats, gameTimeMs }`, `settings/v1`.
- 자동 저장 60 s 간격 + 모드 전환 시. JSON 내보내기/가져오기(설정 화면).
- 스키마 버전 필드 + 마이그레이션 함수 테이블(`src/internal/save/migrations.ts`).

## 5. 포토모드
- 진입 시 시뮬레이션 일시정지(옵션: 군중만 계속). 자유 카메라 + 파라미터 패널:
  시간 스크럽(±12 h), 날씨 프리셋, 노출(EV), 화이트밸런스, FOV/초점거리(14–200 mm 환산), 조리개(DOF), 초점 거리(클릭 포커스), LUT, 비네팅, 그레인, 프레임 가이드(3분할), HUD 숨김.
- 저장: `render.screenshot({scale: 1|2})` → PNG 다운로드 + 도감 사진(썸네일 IndexedDB 저장, 최대 200장).

## 6. 접근성
- 자막: 안내 차임/중요 효과음 텍스트화. 색각 보정 LUT 3종. 모션 민감: 헤드밥·모션블러·FOV 효과 끄기. UI 배율 80–150%.

## 7. `UiBridge` 계약 (`packages/ui/src/api.ts`)
```ts
export interface UiBridge {
  hud: ReadonlySignal<HudModel>;               // 지명, 시각, 날씨, 모드, 프롬프트, 속도, 다음 역
  loading: ReadonlySignal<LoadingModel>;
  discoveries: ReadonlySignal<DiscoveryModel[]>;
  settings: Signal<SettingsModel>;
  worldToMap(posWF: Vec3d): { x: number; y: number };   // Vec3d는 @sanpo/core
  commands: {
    pause(on: boolean): void; fastTravel(stationId: string): Promise<void>;
    setTime(ms: number): void; setWeather(mode: string, preset?: string): void;
    takePhoto(scale: 1 | 2): Promise<Blob>; setPhotoParams(p: PhotoParams): void;
    exportSave(): Promise<Blob>; importSave(f: File): Promise<void>;
  };
}
export function mountUi(root: HTMLElement, bridge: UiBridge): () => void;
```
