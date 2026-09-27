# ADR-0007: PLATEAU CityGML reader implementation
- Status: Proposed (M01-T02 스파이크로 결정)
- Date: 2026-09-27

## Context
CityGML(v4 표준)에서 gml:id·속성·면 종류·LOD3 도로를 손실 없이 추출해야 함.

## Decision
A안 nusamai(PLATEAU GIS Converter) CLI vs B안 자체 SAX 파서를 동일 셀로 비교 후 결정. 인터페이스 `PlateauReader`는 고정.

## Consequences
(스파이크 후 작성)

## Alternatives
(스파이크 후 작성)
