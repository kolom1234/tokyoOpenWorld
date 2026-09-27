# ADR-0009: Procedural facades instead of PLATEAU photo textures
- Status: Accepted
- Date: 2026-09-27

## Context
PLATEAU LOD2 텍스처는 항공사진 기반으로 해상도가 낮고 그림자가 구워져 있어 동적 시간·날씨와 충돌.

## Decision
텍스처는 평균색(틴트) 추출에만 쓰고, 벽면은 용도·층수 기반 절차적 파사드 셰이더(창 그리드, 내부 매핑, 야간 점등)로 표현. 랜드마크는 수작업 오버라이드.

## Consequences
근거리 품질·일관성 향상, 실제 외벽 디테일과는 차이. 오버라이드 목록 확대로 보완.

## Alternatives
원본 텍스처 직접 사용(조명 불일치), AI 텍스처 생성(재현성·라이선스 불확실).
