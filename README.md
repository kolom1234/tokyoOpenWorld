# TOKYO SANPO (도쿄 산보)

실측 오픈 공간데이터로 재현한 가상 도쿄를 걷고, 전철을 타고, 운전하고, 하늘을 날며 구경하는 **브라우저 오픈월드 탐방 게임**.
전투·레이스·경쟁 요소는 없습니다.

- 렌더링: three.js WebGPU(WebGL2 폴백) + TSL, 물리 기반 대기 산란
- 물리: Jolt Physics (Web Worker)
- 데이터: 国土交通省 PLATEAU 3D 도시모델, 国土地理院 DEM, OpenStreetMap, 国土数値情報, ODPT
- 배포: Cloudflare Workers + R2
- MVP 구역: 시부야 – 하라주쿠 – 신주쿠

## 문서
개발자(사람/AI) 모두 `CLAUDE.md`에서 시작하세요. 설계 전체 지도는 `CLAUDE.md §4`.

## 빠른 시작 (구현 이후)
```
pnpm i
pnpm dev
```

## 출처 표기
게임 내 크레딧 화면과 `content/ATTRIBUTION.json` 참조.
© OpenStreetMap contributors / 出典：国土交通省 Project PLATEAU / 出典：国土地理院
