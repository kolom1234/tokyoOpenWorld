# ADR-0002: Google Photorealistic 3D Tiles 미사용
- Status: Accepted
- Date: 2026-09-27

## Context
구글 3D 타일은 도쿄를 사진처럼 보여주지만 게임 월드 자산으로 쓸 수 있는지 검토 필요.

## Decision
사용하지 않는다. 월드는 PLATEAU·GSI·OSM 등 오픈데이터로 자체 구축한다.

## Consequences
약관상 사전 캐싱·오프라인·지오데이터 추출 금지, 지도 시각화 목적·로고 표기 의무 → 물리 콜라이더·자체 스트리밍·게임 사용과 충돌. 대신 자체 파사드·머티리얼 품질에 투자 필요.

## Alternatives
구글 타일 원경 전용 사용(약관 리스크·일관성 문제로 기각).
