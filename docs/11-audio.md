# 11 — Audio (`@sanpo/audio`)

## 1. 구조 (WebAudio)
```
AudioContext
 ├─ ambienceBus   존별 앰비언스 베드(루프 2–4개 크로스페이드) → 존 리버브 send
 ├─ sfxBus        3D 포지셔널(PannerNode HRTF, 근거리 32개 풀) — 신호음, 문, 발소리, 벨
 ├─ vehicleBus    엔진음 합성(AudioWorklet 그라뉼러/RPM 기반), 타이어·바람 노이즈
 ├─ trainBus      주행음(레일 이음매 "탕탕" 주기 = 속도/레일길이 25 m), 모터음, 차내 앰비언스
 ├─ uiBus         UI 효과음 (2D)
 └─ master → DynamicsCompressor → destination
```
- 첫 사용자 제스처 후 `AudioContext.resume()`.
- 거리 감쇠: `inverse`, refDistance 2 m, rolloff 1.2. 가려짐: 리스너–소스 레이캐스트(4 Hz) 차단 시 로우패스 1.2 kHz.

## 2. 앰비언스 존 (셀 `audio.json`)
| kind | 베드 구성 | 리버브 |
|---|---|---|
| `crossing` | 군중 웅성임(밀도 연동 게인), 차량 흐름, 보행 신호 유도음 | 개방 도심 |
| `station` | 콘코스 발소리, 개찰 효과음, 자체 제작 안내 차임 | 대공간 |
| `shopping` | 상점가 소음(가상 음악 없음 또는 CC0/자체 BGM 원거리) | 협곡형 거리 |
| `alley` | 저밀도 생활음, 에어컨 실외기 험, 먼 도로 | 좁은 골목 |
| `park` | 새소리(계절/시간), 바람, 나뭇잎 | 개방 |
| `elevated` | 고가 하부 공명, 열차 통과 | 콘크리트 |
- 시간·날씨 변조: 비 = 빗소리 레이어(표면별: 우산 위, 아스팔트, 나뭇잎), 밤 = 군중 게인↓·곤충(여름).
- 보행자 신호 유도음: 일본식 "뻐꾹/삐요삐요" 계열을 **자체 합성**(주파수·패턴 파라미터화). 음향식 신호기 대상 교차로만.

## 3. 발소리
- 지면 재질(physics `groundMaterial`) × 신발 타입 × 속도 → 샘플 세트 무작위(반복 방지 라운드로빈 + 피치 ±5%).
- 빗속 젖은 노면 레이어.

## 4. 라이선스 규칙 (재확인)
- 사용 가능: 자체 녹음·합성, Freesound **CC0만**, 기타 CC0 라이브러리. 출처는 `content/ATTRIBUTION.json`.
- 금지: 발차 멜로디, 실제 역 안내방송, 편의점 입점 징글, 상업 음악, 실제 광고 음성.

## 5. 공개 API
```ts
export interface AudioService extends SystemProvider {
  unlock(): Promise<void>;
  setListener(camera: CameraState): void;
  addCell(key: CellKey, zones?: AudioZones): void; removeCell(key: CellKey): void;
  playAt(id: SfxId, posWF: Vec3d, opts?: { gain?: number; pitch?: number }): void;
  setVehicleState(s: { rpm: number; throttle: number; speed: number; surface: number } | null): void;
  setTrainState(s: { speed: number; inside: boolean } | null): void;
  setMix(m: Partial<Record<'master'|'ambience'|'sfx'|'vehicle'|'ui', number>>): void;
}
```
