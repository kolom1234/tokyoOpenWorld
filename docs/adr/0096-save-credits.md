# ADR-0096: 세이브(IndexedDB v2 + 마이그레이션 표·내보내기/가져오기)와 크레딧 자동 생성
- Status: Accepted (M10-T06)
- Date: 2026-10-18

## Context
- 12 §4: IndexedDB(idb-keyval) `save/v1` = {posWF, yaw, mode, discovered, photos, stats, gameTimeMs}, 자동 저장 60 s + 모드 전환, JSON 내보내기/가져오기, 스키마 버전 + 마이그레이션 표. 03 §8·12 §2: credits.json(데이터·에셋 출처), oss-licenses.json(코드 라이선스).
- 수락: 구 스키마 세이브 마이그레이션 테스트, 크레딧에 lock 전 소스 표시.

## Decision
1. **스키마 v2**(`SaveData` — ui api): 위치·yaw·모드(walk|freecam)·게임 시각, 발견 기록(시각·날씨·사진 id), 빠른 이동 열림 목록, 사진 메타(명소 연결), 통계(걸은 m). 썸네일 Blob은 `photo/<id>` 키 따로. v1(12 §4 초안 모양)은 `migrateSave`가 단계 함수로 올린다(발견 id → 기록, 사진 poiId null, 시작 지점 3곳 열림). 모르는·망가진 값은 고치거나 버리고, 더 높은 버전은 거부(null). `parseSaveExport` = 형식 표시·마이그레이션·설정 정규화·썸네일은 이미지 data URL만(2 MB 이하).
2. **저장소 = 게임**(`shell/save.ts`, idb-keyval 6.3.0 — DB `tokyo-sanpo`/`kv`): 키 `save/v2`(옛 `save/v1`은 읽어 올리고 지운다). 메뉴 모드(또는 `?save=1`)에서만 — 개발·e2e URL은 저장·복원 안 함(결정론).
3. **모음은 늘 복원**: 부팅 때 저장된 발견·빠른 이동·사진을 복원(새 산책도 모음 유지 — 수집은 플레이어 것), **이어하기**는 위치(빠른 이동)·게임 시각(custom 시계)까지. 자동 저장 = HUD에 있을 때 60 s마다·모드 전환 때(비동기, 새 썸네일만).
4. **내보내기/가져오기**(설정 → 일반 → 세이브): JSON `{format: 'tokyo-sanpo-save', save, settings, thumbs: {id: dataURL}}` 다운로드 / 파일 고르기(키보드·패드는 버튼이 숨은 file input을 연다) → 검사·저장 → 모음·설정 적용.
5. **설정**은 세이브와 따로 localStorage(ADR-0091) — 내보내기 파일에는 함께 담긴다.
6. **크레딧 자동 생성**(`scripts/lib/credits.ts`, Vite 플러그인 `sanpo-credits` — dev 서빙·build 내보내기): `/credits.json` = data/sources.lock.json **모든 원천**(쓰지 않는 것도, 3개 언어 표기는 ATTRIBUTION 같은 id에서) + ATTRIBUTION 전용 항목(에셋·소리·텍스트·Wikidata·자체 설명), `/oss-licenses.json` = 게임 런타임 의존(전이, @sanpo/* 제외 — package.json license, 없으면 LICENSE 문구로 MIT·BSD·Apache·ISC 추정). 월드 빌드별 credits.json(03 §8)은 만들지 않는다(같은 저장소 원천 — 빌드 id만 화면에 표시). 받지 못하면 번들 ATTRIBUTION로 대신.

## Consequences
- 테스트: v1 → v2 마이그레이션·쓰레기·미래 버전·필드 정리, 내보내기 파일 검사, 내보내기 → 가져오기 → 모음 복원 왕복(가짜 저장소), 크레딧 = lock 전 원천 + OSS 24개(라이선스 모두 식별).
- 사진 썸네일(가로 360 JPEG ≈ 20–40 KB) × 최대 200장 ≈ 8 MB IndexedDB — 12 §5 상한 200장은 아직 강제하지 않는다 ⚠️(후속: 오래된 것부터 지우기).
