# 02 — Tech Stack (버전 고정표)

> 기준일 2026-09-27에 npm 레지스트리에서 확인한 버전. `package.json`에는 **정확한 버전(^ 없이)** 으로 고정하고,
> 업그레이드는 태스크 단위로 한 패키지씩 수행 + 골든뷰/성능 테스트 통과 후 이 표를 갱신한다.

## 1. 런타임 (브라우저)
| 영역 | 선택 | 버전 | 라이선스 | 근거 |
|---|---|---|---|---|
| 렌더러 | **three.js `WebGPURenderer`** + TSL | 0.186.1 | MIT | WebGPU 기본 + WebGL2 자동 폴백, TSL 노드 셰이더가 양쪽 백엔드 공통. r186 기준 `SunLight`(CSM), `ClusteredLightsNode`, `SSGINode`, `SSRNode`, `GTAONode`, `TRAANode`, `TAAUNode`, `BloomNode`, `Lut3DNode`, `LightProbeGrid` 등 사실적 렌더링 부품이 addon으로 존재 |
| 대기/하늘 | `@takram/three-atmosphere` (`/webgpu` export) | 0.19.1 | MIT | Bruneton 정밀 대기 산란, 하늘·태양·공중원근·조도. WebGPU 엔트리 제공 |
| 지리 유틸 | `@takram/three-geospatial` (`/webgpu`) | (atmosphere와 동일 릴리스 라인) | MIT | 대기 모듈 의존 |
| 물리 | **Jolt Physics** `jolt-physics` (wasm, multithread 빌드) | 1.1.0 | MIT | 차량(WheeledVehicle/Motorcycle 컨트롤러: 엔진·변속기·차동·타이어 마찰곡선), CharacterVirtual(계단·경사·이동발판), 대규모 정적 메시 성능. AAA 채택 실적 |
| 내비/군중 | `recast-navigation` (+ `@recast-navigation/three`) | 0.43.1 | MIT | Recast 내비메시 + DetourCrowd |
| 메시 가속 | `three-mesh-bvh` | 0.9.15 | MIT | 레이캐스트(카메라 충돌, 픽킹) |
| 압축 디코드 | `meshoptimizer` (디코더) / three `KTX2Loader` (Basis) | 1.3.0 / three 내장 | MIT / Apache-2.0 | glTF `EXT_meshopt_compression`, `KHR_texture_basisu` |
| 태양·달 위치 | `suncalc` | 2.0.2 | BSD-2 | 검증된 천문 계산 |
| 절차적 나무 | `@dgreenheck/ez-tree` | 1.1.0 | MIT | 파이프라인에서 수종별 나무 메시 생성(런타임 의존 아님) |
| UI | `preact` + `@preact/signals` | 10.29.8 / 2.11.2 | MIT | 작은 번들, 시그널로 HUD 갱신 최소화 |
| 로컬 저장 | `idb-keyval` | 6.3.0 | Apache-2.0 | IndexedDB 간단 래퍼(세이브/설정) |
| 워커 RPC | `comlink` | 4.4.2 | Apache-2.0 | 타입 안전 워커 명령 채널 (대용량은 SAB 직접) |
| GPU 티어 | `@pmndrs/detect-gpu` | 6.0.23 | MIT | 초기 품질 티어 추정 |
| 디버그 | `stats-gl`, `lil-gui` | 4.2.3 / 0.21.0 | MIT | `?debug=1`에서만 동적 import |

## 2. 빌드·품질 도구
| 영역 | 선택 | 버전 |
|---|---|---|
| 런타임 | Node.js 24 LTS (`.nvmrc`=24, `engines` ≥22.12 허용 — ADR-0011) | 24.x (하한 22.12) |
| 패키지 매니저 | pnpm (workspaces) | 10.34.5 (`packageManager` 필드 고정) |
| 언어 | TypeScript | 6.0.3 (`typescript-eslint` 호환 범위 < 6.1. TS 7 전환은 별도 ADR) |
| 번들러 | Vite | 8.3.1 |
| CF 배포 | `wrangler` (선택: `@cloudflare/vite-plugin` 1.60.2 — 도입 시 ADR) | 4.141.0 |
| 린트/포맷 | Biome | 2.5.14 |
| 의존 규칙 | dependency-cruiser | 18.4.0 |
| 단위 테스트 | Vitest | 5.0.2 |
| E2E/골든뷰 | Playwright | 1.63.0 |
| 타입 | `@types/three` | 0.186.0 |
| 타입(Node 툴·스크립트) | `@types/node` — 하한 Node 22 API로 고정(ADR-0011·0014) | 22.20.4 |
| CI 액션 | `actions/checkout`·`actions/setup-node` v7, `pnpm/action-setup` v6, `actions/github-script` v9 | 메이저 태그 |

## 3. 데이터 파이프라인 도구 (`tools/pipeline`)
| 도구 | 용도 | 라이선스 |
|---|---|---|
| Node (컨테이너) | `node:24.21.0-bookworm-slim`에서 복사, pnpm 10.34.5(corepack) | MIT |
| `saxes` 6.0.0 | **PLATEAU CityGML 리더(채택, ADR-0007)** — 스트리밍 SAX | ISC |
| **PLATEAU GIS Converter (nusamai) CLI** v0.1.19 | 비교·회귀용 A안 리더(ADR-0007), HLOD 원천 변환 후보 | MIT |
| GDAL/OGR 3.13.3 (이미지 `ghcr.io/osgeo/gdal:ubuntu-small-3.13.3` 기반; `gdalwarp`, `ogr2ogr`) | DEM 재투영·모자이크, 벡터 변환 | MIT |
| osmium-tool | OSM PBF 추출/필터 (`osmium extract`, `tags-filter`, `export`) | GPL-3.0 (도구 실행만, 링크 안 함) |
| `@gltf-transform/core,functions,extensions` 4.5.0 | glTF 병합·정리·meshopt·텍스처 처리 | MIT |
| `meshoptimizer` (simplify, encode) | LOD 단순화, 압축 | MIT |
| KTX-Software `toktx` ≥ 4.3 | KTX2(ETC1S/UASTC) 인코딩 | Apache-2.0 |
| `proj4` 2.22.0 (JS) / pyproj (검증용) | 좌표 변환 (EPSG 정의 고정 문자열 사용) | MIT |
| `recast-navigation` (Node) | 셀별 내비메시 타일 굽기 | MIT |
| `@aws-sdk/client-s3` 3.x | R2(S3 호환 API) 업로드 | Apache-2.0 |
| Blender 4.x (수작업) | 랜드마크 오버라이드 모델링 | GPL (도구만) |

파이프라인은 `tools/pipeline/Dockerfile`에 위 바이너리를 고정 버전으로 설치하여 재현성 확보.

## 4. 인프라
| 영역 | 선택 |
|---|---|
| 호스팅 | Cloudflare Workers (Static Assets로 게임 번들) |
| 월드 데이터 | Cloudflare R2 (egress 무료), Worker 바인딩 + Cache API |
| 설정/포인터 | Workers KV (`CURRENT_BUILD:v<formatVersion>` = 활성 buildId) |
| CI/CD | GitHub Actions (`wrangler deploy`) |

## 5. 채택하지 않은 대안 (재논의 시 ADR 참조)
| 대안 | 기각 사유 |
|---|---|
| Babylon.js | 품질·WebGPU는 우수하나 대기(Bruneton) 생태계와 3D 지리 도구가 three 쪽이 풍부. ADR-0001 |
| Unreal/Unity 네이티브 | 요구사항이 브라우저 + Cloudflare 배포. ADR-0001 |
| Rapier | 사용 편의성 우수하나 차량 파워트레인·타이어 모델이 Jolt보다 단순. 물리 API는 `PhysicsWorld` 인터페이스 뒤에 숨겨 교체 가능하게 둠. ADR-0003 |
| Google Photorealistic 3D Tiles | 약관상 사전 캐싱·오프라인·지오데이터 추출 금지, 지도 시각화 목적 한정 → 게임 월드 자산으로 부적합. ADR-0002 |
| OGC 3D Tiles + 3DTilesRendererJS | 표준 HLOD 스트리밍은 매력적이나 물리 콜라이더·내비·교통 레인 등 게임 레이어를 같은 셀에 묶기 어렵고, 셀 단위 결정론적 관리가 복잡. 자체 TKC 그리드 채택. ADR-0004 |
| ECS 프레임워크(bitecs 등) | AI 유지보수 관점에서 "서비스 + 고정 순서 시스템 + SoA 배열"이 더 읽기 쉬움. 군중/교통은 SoA TypedArray로 충분 |
