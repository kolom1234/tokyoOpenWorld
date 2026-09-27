# ADR-0003: Physics: Jolt (wasm) in a dedicated worker
- Status: Accepted
- Date: 2026-09-27

## Context
사실적인 차량·자전거·캐릭터(계단·이동 발판) 물리가 필요.

## Decision
jolt-physics 1.1.0을 physics.worker에서 실행하고 `PhysicsService` 인터페이스 뒤에 숨긴다.

## Consequences
WheeledVehicle/Motorcycle 컨트롤러, CharacterVirtual 활용. 수동 메모리 해제(destroy) 규율 필요. 멀티스레드는 COOP/COEP 필요.

## Alternatives
Rapier(사용 편의 우수, 차량 모델 단순) — 인터페이스로 교체 가능성 유지.
