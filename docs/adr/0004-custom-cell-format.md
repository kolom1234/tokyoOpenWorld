# ADR-0004: World data: custom TKC grid cells (not OGC 3D Tiles)
- Status: Accepted
- Date: 2026-09-27

## Context
렌더 메시 외에 콜라이더·내비메시·차선·광원·오디오 존을 같은 공간 단위로 스트리밍해야 함.

## Decision
256 m 정사각 셀 + 4배 HLOD(L1–L3) + 섹션형 컨테이너 TKC v1을 사용한다. glTF(meshopt)는 섹션 내부 포맷으로 활용.

## Consequences
셀 단위 결정론적 빌드·증분·검증이 단순. 표준 3D Tiles 뷰어와 호환은 포기(필요 시 변환기 별도 작성).

## Alternatives
OGC 3D Tiles 1.1 + 3DTilesRendererJS(게임 레이어 결합이 복잡).
