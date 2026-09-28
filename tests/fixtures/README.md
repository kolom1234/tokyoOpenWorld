# tests/fixtures — 커밋되는 소형 월드·원천 샘플 (M01-T07)

저장소 안에 두는 유일한 월드 데이터. 합계 ≤ 5 MB(현재 ≈ 3.4 MB). `.gitignore`의 `!tests/fixtures/**`가 `*.tkc` 제외를 되돌린다.
**직접 편집 금지** — 아래 명령으로 다시 만든다(`ATTRIBUTION.json`·`expected.json`도 생성물). Biome 대상에서 빠져 있다(생성 바이트 보존).

## world-mini/ — 빌드된 L0 2×2 월드
| 파일 | 내용 |
|---|---|
| `world.json` | 매니페스트(`areas = world-mini`, l0 ix −1..0 × iz −1..0, spawn = 스크램블 교차로 WF (−22.3, 0, 8.6) ∈ L0_-1_0) |
| `cells.idx` | 셀 4개 색인(크기·hash32) |
| `L0/<ix>/<iz>.tkc` | L0_-1_-1, L0_0_-1, **L0_-1_0(스크램블 교차로)**, **L0_0_0(스크램블 스퀘어, measuredHeight 220 m)** — terrain.mesh·terrain.height·buildings.mesh·meta.json |
| `ATTRIBUTION.json` | 출처 표기(`schemas/attribution.schema.json`): PLATEAU 渋谷区 2025, GSI DEM1A/5A |

M01-T05 빌드 파이프라인 그대로(`buildArea` → `validateBuild` 0 오류 → 복사). 이웃 4쌍 경계 비트 일치.

### 게임에서 불러오기 (`?world=mini`)
| 환경 | URL | 제공 방식 |
|---|---|---|
| 개발(`pnpm dev`) | `http://localhost:5173/?world=mini` | Vite 미들웨어가 이 폴더를 `/fixtures/world-mini/*`로 서빙 |
| `vite preview`·CI e2e | `http://localhost:4173/?world=mini` | `vite build`가 `dist/fixtures/world-mini/`로 복사 |
| PR preview·staging | `https://<preview>/?world=mini` | 같은 복사본이 Workers 정적 에셋으로 배포(`Cache-Control: no-cache`) |
| production | 지원 안 함 | 배포 빌드에 `SANPO_WORLD_MINI=0` → 복사 생략 |

플래그가 없으면 게임은 `/api/world/current` → R2 빌드를 쓴다. 부트 화면 `#app[data-world="loaded"][data-world-source="fixture"][data-world-cells="4"]`가 e2e 판정 기준(`tests/e2e/boot.spec.ts`).

## snapshots/world-mini-decode.json — 셀 메시 디코드 기준값 (M02-T02)
world-mini 4셀의 `terrain.mesh`·`buildings.mesh`를 **파이프라인 디코더(gltf-transform)**로 풀어 요약한 값: 프리미티브별 정점·인덱스 수,
속성 레이아웃(itemSize·타입·정규화), 내용 해시(`tkcHash32` — POSITION은 셀 로컬 float32로 역양자화한 값, 인덱스는 u32).
`tools/pipeline/test/world-mini-decode.test.ts`가 기록·검사(`toMatchFileSnapshot`, 갱신 `-u`)하고, 런타임 디코더
(`packages/streaming/test/decode.test.ts`·`scheduler.test.ts`, e2e `tests/e2e/decode.spec.ts`)는 **읽기만** 해서 일치를 확인한다(ADR-0022).
world-mini를 재생성하면 이 파일도 `-u`로 갱신한다.

## plateau-mini/ — 원천 발췌(파이프라인 단위 테스트 입력)
| 경로 | 내용 |
|---|---|
| `plateau-shibuya/udx/bldg/*.gml` | PLATEAU CityGML 원문에서 L0_-1_0 건물 5동만 남긴 발췌(헤더 + `core:cityObjectMember` 원문 그대로). **appearance(텍스처) 블록 제거** |
| `plateau-shibuya/udx/tran/*.gml` | 같은 셀에 걸치는 도로(Road) 3개 원문 발췌 |
| `gsi-dem/dem_L0_-1_0.{json,f32.gz}` | `dem_1m.tif`(GSI DEM1A + 5A 결측 채움 → EPSG:6677 1 m 재투영) 창: 셀 L0_-1_0 ± 1 m, 259², Float32 LE(행 = z 북→남). GDAL 없이 셀 빌드를 돌리기 위한 가공 조각 |
| `expected.json` | 1셀 빌드 스냅샷(섹션별 XXH64 — glb는 저장 바이트, gzip 섹션은 해제 바이트라 zlib 버전 무관) |
| `ATTRIBUTION.json` | 출처 표기 |

`tools/pipeline/test/fixtures.test.ts`가 normalize(SAX 리더) → build → 2회 바이트 동일 + `expected.json` 일치를 CI에서 검사한다.
파이프라인 출력이 의도적으로 바뀌면 아래 재생성 명령으로 `expected.json`을 갱신하고 PR에 사유를 적는다.

## 라이선스·출처
- 「出典：国土交通省 Project PLATEAU 3D都市モデル（渋谷区）を加工して作成」 — PLATEAU Site Policy(CC BY 4.0 호환).
- 「出典：国土地理院（基盤地図情報 数値標高モデル）を加工して作成」 — 国土地理院コンテンツ利用規約(CC BY 4.0 호환).
- 원천 버전·해시: `data/sources.lock.json`(`plateau-shibuya`, `gsi-dem`). 표: `docs/03-data-sources.md`.

## 재생성 (컨테이너 전용: 원천·정규화 데이터와 GDAL 필요)
```
tools/pipeline/docker/run.sh node tools/pipeline/src/cli.ts fixture                  # 둘 다
tools/pipeline/docker/run.sh node tools/pipeline/src/cli.ts fixture --only world-mini
```
전제: `data/normalized/{buildings,terrain}`(M01-T02·T03), `data/raw/plateau-shibuya/extracted/udx`.
