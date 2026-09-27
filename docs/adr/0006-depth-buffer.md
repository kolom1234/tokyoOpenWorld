# ADR-0006: Depth buffer strategy
- Status: Proposed (M01-T06에서 결정)
- Date: 2026-09-27

## Context
근평면 0.1 m ~ 원평면 60 km에서 Z-파이팅 없이 렌더링 필요.

## Decision
r186에서 reversed-Z 지원 확인 시 채택, 아니면 logarithmicDepthBuffer. 성능·후처리(깊이 기반 패스) 호환성 측정 후 확정.

## Consequences
후처리 노드들이 깊이 표현에 의존하므로 결정 후 변경 비용 큼.

## Alternatives
근/원평면 동적 조정(비행 고도에 따라) — 보조 수단으로 병행 가능.
