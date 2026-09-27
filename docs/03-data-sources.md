# 03 — Data Sources & Licensing

> 규칙: 여기 없는 데이터/에셋은 사용 금지. 추가 시 이 표 + `content/ATTRIBUTION.json` + `data/sources.lock.json` 동시 갱신.
> ⚠ 표시 = 배포 전 원문 약관 재확인 필요 (M11-T05 "라이선스 감사" 태스크에서 일괄 확인).

## 1. 지리 공간 데이터
| ID | 데이터 | 제공 | 사용 레이어 | 라이선스 / 출처 표기 |
|---|---|---|---|---|
| `plateau-shibuya` | 3D 도시모델 시부야구 (최신 연도판, 2025년도판 공개 확인) | 국토교통성 Project PLATEAU / G공간정보센터 | 건물 LOD2(+텍스처), 도로 LOD1–3, 교량, 도시설비(frn) LOD3, 식생(veg) LOD3, DEM, 토지이용 | PLATEAU 사이트 폴리시(CC BY 4.0 호환). 저작권은 해당 지자체. 표기: `出典：国土交通省 Project PLATEAU 3D都市モデル（渋谷区）を加工して作成` ⚠ 측량법상 공공측량 성과 이용 조건 확인 |
| `plateau-shinjuku` | 3D 도시모델 신주쿠구 (최신 연도판) | 동상 | 동상 | 동상 (`新宿区`) |
| `plateau-tokyo23` | 3D 도시모델 도쿄 23구 (2020년도판: LOD1 전역, LOD2 중점지구 11곳) | 동상 | HLOD L1–L3 원거리 스카이라인 | 동상 |
| `gsi-dem` | 기반지도정보 수치표고모델 5 m (DEM5A, 항공레이저). 23구 1 m 메시 제공분이 있으면 우선 | 국토지리원 | 지형 높이장, 물리 heightfield | 국토지리원 콘텐츠 이용규약(CC BY 4.0 호환). 표기: `出典：国土地理院（基盤地図情報 数値標高モデル）を加工して作成` ⚠ 측량법 승인 필요 여부 |
| `gsi-photo` | 지리원 타일 전국최신사진(seamlessphoto) | 국토지리원 | 원거리 지면 알베도 참고(HLOD 지면 텍스처 저주파 색) | 동 규약. 표기 `出典：地理院タイル（全国最新写真）` |
| `osm-kanto` | OpenStreetMap 간토 추출본 (Geofabrik `kanto-latest.osm.pbf`) | OSM 기여자 | 도로 속성(차선·일방통행·제한속도), 신호, 철도 선로 상세, 플랫폼, 나무, 공원, POI 이름, 건물 층수 보완 | **ODbL 1.0**. 표기 `© OpenStreetMap contributors`. 파생 DB 공개 의무 → §4 참조 |
| `ksj-n02` | 국토수치정보 철도 데이터(N02, 최신판) | 국토교통성 | 노선 중심선, 역 위치, 사업자·노선명 | 국토수치정보 이용약관 ⚠ 데이터셋별 상용 가능 여부 표시 확인. 표기 `出典：国土数値情報（鉄道データ）` |
| `estat-small-area` | 국세조사 소지역(町丁・字) 경계 2020 | e-Stat | HUD 지명 표시(○○区 ○○町 ○丁目) | 정부표준이용규약(CC BY 4.0 호환). 표기 `出典：政府統計の総合窓口(e-Stat)` |

## 2. 교통·시간표
| ID | 데이터 | 라이선스 | 사용 여부 |
|---|---|---|---|
| `odpt-tokyometro` | 도쿄메트로 GTFS/GTFS-JP (ODPT) | 공공교통 오픈데이터 기본 라이선스. ODPT 개발자 등록(키) 필요 | ✅ 긴자선 시간표(시각 운행). 후쿠토신선 등 지하 노선은 M12+ |
| `odpt-toei` | 도에이 지하철/버스 (ODPT) | ⚠ 라이선스 명칭 확인 | 🔶 MVP 범위 밖(오에도선은 M12+) |
| `odpt-jreast` | JR동일본 (ODPT) | "공공교통 오픈데이터 챌린지 한정 라이선스" → 상시 서비스 사용 불가 | ❌ 사용 금지. 야마노테선은 **합성 시간표**(`10-simulation.md §6.1`, ADR-0008) |

## 3. 부가 데이터
| ID | 데이터 | 라이선스 | 비고 |
|---|---|---|---|
| `wikidata` | 랜드마크 다국어 이름·좌표·짧은 설명 | CC0 | Wikipedia 본문(CC BY-SA)은 번들 금지. 설명문은 자체 작성(`content/poi/*.yaml`) |
| `open-meteo` | 현재 날씨(실시간 날씨 모드) | 데이터 CC BY 4.0. 무료 API는 비상업 한정 ⚠ 상업화 시 유료 플랜 | 기능 플래그 `liveWeather` 기본 OFF |

## 4. 에셋 (텍스처·모델·폰트·사운드)
| 소스 | 사용 | 라이선스 |
|---|---|---|
| ambientCG | PBR 머티리얼(아스팔트, 콘크리트, 타일, 금속, 유리, 페인트) | CC0 |
| Poly Haven | PBR 텍스처, HDRI(포토모드 참고용), 일부 소품 모델 | CC0 |
| Quaternius (Universal Base Characters / Universal Animation Library 무료판) | 보행자 베이스 메시·애니메이션 | CC0 |
| Kenney | 보조 소품/아이콘 | CC0 |
| `@dgreenheck/ez-tree` | 나무 메시 생성기(파이프라인) | MIT (생성물은 자체 산출물) |
| Noto Sans JP / Noto Sans KR | UI 폰트 (자체 호스팅, 서브셋) | SIL OFL 1.1 |
| Freesound (CC0 필터만) / 자체 녹음·합성 | 환경음·효과음 | CC0 / 자체 |
| 자체 제작 (Blender) | 랜드마크 오버라이드, 일본 특유 소품(자판기·전신주·신호등·가드레일·표지판) | 프로젝트 소유 |

## 5. 사용 금지 목록
- Google/Apple/Mapbox/Zenrin 등 상용 지도·3D 타일 (약관: 캐싱·추출·게임 사용 제한)
- 실제 기업 로고·상표·점포 간판 그래픽, 광고 영상 (→ 가상 브랜드/무지 간판으로 대체)
- 역 발차 멜로디(発車メロディ), 점포 입점 징글, 실제 안내방송 녹음 (저작권)
- 실존 열차 차량의 정밀 복제 디자인 (→ "일반 통근형 전동차" + 노선색 띠 정도로 식별)
- 라이선스가 불명확하거나 "비상업 한정"인 에셋 (Sketchfab 임의 모델, Mixamo 등 약관 복잡 소스 포함)
- JR동일본 ODPT 챌린지 한정 데이터

## 6. ODbL(OSM) 준수 설계
- 추적성: OSM을 입력으로 쓴 모든 섹션은 헤더 `sources[]`에 `osm-kanto`를 기록한다(05 §3). validate 단계가 목록을 보고서로 출력.
- 빌드 산출물 중 OSM 파생 DB(정규화 GeoPackage)를 `R2: world/<buildId>/odbl/osm-derived.gpkg`로 공개하고 크레딧 화면에 링크.
- 게임 화면(Produced Work)에는 `© OpenStreetMap contributors` 상시 표기(크레딧 + 지도 화면 하단).

## 7. `data/sources.lock.json` 형식 (커밋 대상)
```json
{
  "schema": 1,
  "sources": [
    {
      "id": "plateau-shibuya",
      "url": "https://www.geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-<year>",
      "resource": "CityGML(v4)",
      "fiscalYear": 2025,
      "retrievedAt": "2026-10-01",
      "sha256": "<zip sha256>",
      "license": "PLATEAU-SitePolicy (CC-BY-4.0 compatible)",
      "attribution": "出典：国土交通省 Project PLATEAU 3D都市モデル（渋谷区）を加工して作成"
    }
  ]
}
```
`pnpm pipeline fetch`는 lock에 있는 sha256과 불일치하면 중단한다(버전 드리프트 방지). 새 연도판 반영 = lock 갱신 커밋 + ADR 불필요, PROGRESS에 기록.

## 8. 크레딧 화면 생성
`content/ATTRIBUTION.json` + `sources.lock.json` → 파이프라인 publish 단계가 `world/<buildId>/credits.json` 생성(데이터 빌드와 버전 일치) → UI 크레딧 화면이 로드해 언어별 렌더. 코드 OSS 라이선스 목록은 앱 빌드 시 `apps/game/public/oss-licenses.json`으로 별도 생성.
