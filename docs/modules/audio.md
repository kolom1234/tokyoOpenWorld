# @sanpo/audio
Layer: L2 | Depends: core, geo, tile-format(AudioZones 타입) | Used by: apps/game

## Purpose
WebAudio 기반 앰비언스 존, 3D 효과음, 엔진·열차 합성음, 발소리, 믹서.
상세: `docs/11-audio.md` (API §5).

## Public API (요약)
`createAudio(deps) → AudioService`: `unlock, setListener, addCell, removeCell, playAt, setVehicleState, setTrainState, setMix` (+ `SystemProvider`: phase 60).

## Invariants
- 사용자 제스처 전 재생 시도 금지(unlock 대기).
- 포지셔널 보이스 풀 32개 상한, 초과 시 가장 먼/작은 소리 스틸.
- 모든 샘플 출처가 `content/ATTRIBUTION.json`에 존재(빌드 검사).

## Files
context.ts, buses.ts, zones.ts, emitters.ts, footsteps.ts, occlusion.ts, synth/(engine.worklet, train, signal-tones), loader.ts.

## Status
미구현 (M09-T04).
