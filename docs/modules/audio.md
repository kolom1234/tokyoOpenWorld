# @sanpo/audio
Layer: L2 | Depends: core, geo, tile-format(AudioZones·AudioManifest·JCOL_MATERIAL 타입) | Used by: apps/game

## Purpose
WebAudio 기반 앰비언스 존, 3D 효과음, 열차·엔진 합성음, 발소리, 믹서(11 §1–§5, ADR-0079).
상세: `docs/11-audio.md` (API §5).

## Public API
```ts
createAudio(deps: AudioDeps { log; manifestUrl?: string /* 빌드 shared/audio/manifest.json */; createContext?; fetchFn?; initialMix?: Partial<AudioMix> }): AudioService
AudioService extends SystemProvider /* 'audio' phase 60 */ {
  readonly state: 'locked' | 'running' | 'unavailable';  unlock(): Promise<void>   // 첫 제스처 뒤 AudioContext 생성·resume
  setListener(camera: CameraState, groundY?): void;  addCell(key, zones?: AudioZones): void;  removeCell(key): void
  setEnvironment(e: AudioEnv { gameTimeMs; night 0..1; rainMmH; windMs; crowd 0..1; umbrella }): void
  setFootsteps(s: FootstepState { speedMs; grounded; material /* JCOL_MATERIAL */; wet } | null): void
  setSignalSource(f: ((code) => PedSignal 'W'|'F'|'D') | null): void   // 음향식 보행 신호 유도음
  setOccluder(f: ((fromWF, toWF) => Promise<boolean>) | null): void    // 가려짐 → 로우패스 1.2 kHz(4 Hz)
  playAt(id: SfxId, posWF, opts?: { gain?; pitch? }): void;  playUi(id: SfxId): void
  setVehicleState(s | null): void;  setTrainState(s: { speed; inside } | null): void;  setTrainsNear(t: NearTrain { id; posWF; speedMs }[]): void
  setMix(m: Partial<AudioMix>): void;  readonly mix: AudioMix /* master(0–1.5)·ambience·sfx·vehicle·train·ui */
  stats(): AudioStats { state, zones, beds, loaded, files, voices, signalTones, steps, mix };  dispose(): void
}
SfxId = 'gateOpen'|'gateClose'|'gateDenied'|'cardTouch'|'stationChime'|'lcdChime'|'doorChime'|'uiClick'   // 전부 자체 합성
```

## Invariants
- 사용자 제스처 전 재생 시도 금지 — AudioContext 자체를 unlock() 전에 만들지 않는다. AudioContext 없는 환경 = 'unavailable', 모든 호출 무음 no-op(헤드리스 e2e).
- 포지셔널 보이스 풀 32개 상한, 넘치면 우선순위(이득 ÷ 거리²) 최저를 빼앗는다(새 소리가 더 낮으면 버림).
- 이득 변화는 setTargetAtTime 램프만(베드 τ 0.8 s, 버스 0.12 s) — 존 경계·시간대 변화에 클릭 없음. 새 베드 소스는 이득 0에서 시작.
- 존 가중 = 리스너 둘레 원반 표본 32점(반경 14 m)의 존 포함 비율(같은 종류 사각형 경계에서 꺼지지 않음).
- 녹음 파일은 manifest(빌드 `shared/audio/`, R2 공유 에셋)에서 처음 필요할 때 디코드(첫 로드 예산 밖). 모든 원천 = `content/audio/library.json` + `content/ATTRIBUTION.json`(pipeline test가 누락 0 검사).
- 신호 유도음·개찰구·차임·LCD음은 녹음 금지 — synth/ 합성(실제 기기·사업자 음과 다른 음형).
- 오디오 좌표 = WF − 원점(1024 m 격자로 리스너를 따라 이동) — float32 정밀도.

## Files
api.ts, index.ts, internal/{service(상태·입력), engine(실행 중 그래프 묶음·열차), graph(버스·압축·절차 IR 잔향), assets(manifest·지연 디코드), zones(ZoneIndex 원반 표본), mixer(존 × 낮밤·계절·비·바람·고도 → 베드 이득), beds(루프 램프), voices(32 풀·빼앗기·가려짐 필터), emitters(유도음 발음체), footsteps(재질 → 세트·보폭 시계·라운드로빈), synth/{signal-tones, sfx, train(주행음·이음매·엔진)}}.

## Status
M09-T04 구현(ADR-0079). 엔진(drive 모드)은 합성만 준비 — drive 모드가 생기면 setVehicleState.
