# ADR-0007: PLATEAU CityGML reader implementation
- Status: Accepted (M01-T02 스파이크)
- Date: 2026-09-27

## Context
normalize 단계는 CityGML(PLATEAU 標準製品仕様書 v5)에서 gml:id·속성(measuredHeight, storeys, usage, buildingID)·면 종류(roof/wall/ground/closure)·텍스처 UV·LOD3 도로 TrafficArea 기능을 손실 없이 뽑아 `@sanpo/geo`로만 WF 변환해야 한다(Hard Rule 5). 인터페이스 `PlateauReader.read(file): AsyncIterable<NormalizedFeature>`는 고정(`tools/pipeline/src/readers/plateau/types.ts`)이라 구현은 교체 가능.

스파이크 조건: 시부야구 2025년도판(`plateau-shibuya`, sha256 `f7437469…`), 스크램블 교차로 주변 3×3 셀 L0 ix −2..0, iz −1..1(WF x −512..256, z −256..512) = 3차 메시 53393585/86/95/96에 걸침. 입력 8파일 = bldg 4개(364 MB) + tran 4개(60 MB).
파이프라인 컨테이너(`tools/pipeline/Dockerfile`: Node 24.21.0, GDAL 3.13.3, nusamai 0.1.19), Windows 호스트 저장소 바인드 마운트, 16코어.
재현: `node tools/pipeline/src/spike/plateau-spike.ts run|run-discard <reader> data/derived/spike <gml…>` → `compare`.

- **A안 nusamai**: CLI `--sink gpkg --epsg 6697` → `ogr2ogr GeoJSONSeq` → Node(`readers/plateau/nusamai.ts`)
- **B안 SAX**: `saxes` 6.0.0 스트리밍으로 CityGML 직접 해석(`readers/plateau/citygml-sax*.ts`, `citygml-assemble.ts`)

## 결과 (같은 8파일, 건물은 중심점 셀·도로는 bbox 겹침으로 3×3 필터)
| 항목 | A nusamai | B SAX |
|---|---|---|
| 건물 수(공통) | 1081 (1079) | 1082 (1079) — 차이 3동은 A에 installation이 없어 중심점이 달라져 셀 경계를 넘은 것(추정) |
| gml:id·measuredHeight·storeys·buildingID | 1079/1079 일치(buildingID는 별도 평탄화 테이블 `parentId` 조인 필요) | 동일(직접) |
| usage | 코드리스트 **명칭**("業務施設")으로 해석됨, 코드 소실 | **코드**("401") 보존, 명칭 대조 1079/1079 일치 |
| 면 종류 | **소실**: 테마면이 건물당 MultiPolygon 1개로 병합, gpkg가 2D CCW로 링 방향을 정규화해 바닥면도 위를 향함(ground 면적 0 m²). ClosureSurface 구분 불가 | 보존: roof 13,262 / wall 22,712 / ground 1,138 / installation 62,168면 |
| BuildingInstallation | 별도 레이어(조인 필요) | `installation`으로 포함 |
| 텍스처 UV | gpkg 0 (glTF 싱크는 아틀라스로 유지하나 역시 면 의미 병합) | 87,373면 연결(이미지 + 링별 UV) |
| 도로 기능(LOD3) | **소실**: TrafficArea가 Road MultiPolygon으로 병합, 27,701 폴리곤 전부 `other` | 차도 156,809 m² / 보도 116,371 / 섬 1,147, lod3 27,682·lod2 16·lod1 3 레코드 |
| 기하 일치 | 건물별 폴리곤 수 1079/1079 동일, bbox 최대차 0.01 m(ogr2ogr GeoJSON 기본 소수 7자리 한계), 폴리곤 순서는 다름 | 기준 |
| 좌표계 | 기본 출력 EPSG:4979(지오이드 → 타원체고)라 `--epsg 6697` 강제 필요. glTF는 평면직각만 지원 + nusamai 자체 투영 | EPSG:6697 → `@sanpo/geo`만으로 WF |
| 시간(8파일, cold/warm 캐시) | 29.6 s / 23.4 s (nusamai 단독: bldg 파일당 4.7–8.0 s, tran ≈0.7 s) | 20.9 s / 11.1 s |
| 최대 메모리(RSS, 결과 비보유) | ≤ 143 MB (node 131, nusamai 58–145 MB) | 443 MB(게으른 GC). `--max-old-space-size=160`에서도 정상(RSS 291 MB) |
| 의존성 | nusamai·GDAL 바이너리(컨테이너 전용) | 순수 Node(`saxes`), CI/Windows에서도 동작 |

## Decision
**B안(`citygml-sax` SAX 파서) 채택.** `createPlateauReader()` 기본값 = `citygml-sax`.
면 종류·텍스처 UV·LOD3 도로 기능은 게임 렌더 레이어(파사드/지붕 머티리얼, 보도/차도 분리)에 직결되는데 A안은 모든 싱크(gpkg/geojson/glTF)에서 구조적으로 잃는다. B안은 1.4–2.1× 빠르고 메모리도 파이프라인 머신 예산(16 GB) 대비 충분히 작다.
nusamai 리더는 비교·회귀 확인용으로만 유지(`--reader nusamai`), Dockerfile에도 남긴다(M09 HLOD 원천(plateau-tokyo23 LOD1) 변환 후보로 재검토 가능).

## Consequences
- CityGML 해석을 직접 유지보수한다. 가정: PLATEAU 표준 접두사(`bldg/tran/gml/app/uro`), EPSG:6697 `gml:posList`, appearance는 링 id로 연결. 접두사 매핑은 해석하지 않음(xmlns:false, 속도) → 새 연도판에서 접두사가 바뀌면 루트 `xmlns` 검사 추가.
- 미지원(2025 시부야 데이터에 없음 또는 범위 밖): `gml:pos`/`gml:coordinates`, `xlink:href` 기하 참조(lod2Solid는 boundedBy와 같은 면이라 건너뜀), LOD4/내부, X3DMaterial 색. 비정상 링은 `SaxStats.skippedRings`로 집계.
- BuildingPart는 부모 Building 레코드에 병합(속성은 부모 우선). OuterFloorSurface→roof, OuterCeilingSurface→ground.
- 정규화 산출: `data/normalized/{buildings,roads}/<cellId>.ndjson.gz`, 좌표 1 mm·id 정렬·gzip 헤더 고정 → 반복 실행 바이트 동일(3×3 셀 9+9 파일 2회 검증).
- 규칙: 도로면은 셀 경계에서 클리핑(Sutherland–Hodgman, 경계 좌표 = limit 정확, Y 선형 보간), 건물은 중심점 셀에만.
- 미해결: 횡단보도는 PLATEAU tran에 없음 → OSM derive 단계에서 생성(`function: 'crosswalk'` 예약).

## Alternatives
- A nusamai gpkg/geojson: 속성·기하 충실도는 충분하나 면 종류·도로 기능·UV 소실(표 참조). 복원하려면 법선·높이 휴리스틱 등 자체 후처리가 필요해 B보다 나쁨.
- A' nusamai glTF: 텍스처·feature id 유지, 그러나 면·TrafficArea 병합, 자체 투영(Rule 5 위반), 다음 단계에서 메시 재분해 필요 → 기각.
- A'' nusamai `serde`(bincode): 내부 Rust 타입 레이아웃이라 안정 계약 아님 → 기각.
- GDAL GMLAS 드라이버: 스키마 기반 XML→테이블 방식으로 검토했으나 PLATEAU ADE(uro)·appearance 조인이 복잡하고 느림 → 시도 안 함.
