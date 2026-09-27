# ADR-0020: DecodedMesh 속성 규약과 M01 임시 셀 경로
- Status: Accepted
- Date: 2026-09-28

## Context
M01-T06에서 셀 메시를 처음 화면에 올렸다. `DecodedMesh`(@sanpo/tile-format)는 디코더(M02 streaming 워커)와 render 사이의 계약인데,
속성 이름·좌표 표현이 정해져 있지 않았다. 또 streaming(M02)이 없어 셀을 메인 스레드에서 임시로 파싱해야 했다.

## Decision
1. **속성 이름 = glTF 의미 이름**: `POSITION`, `NORMAL`, `TEXCOORD_0`, `_SURF`, `_BLDG`, `_FACADE`(대문자 그대로).
   render(`cell-node.ts`)가 three 이름(`position`, `normal`, `uv`, 그 외 소문자)으로 바꾼다. 디코더는 three를 몰라도 된다(06 §1).
2. **POSITION = 셀 로컬 미터 float32**. 양자화 glb(ADR-0018 §4: u16 + 노드 균일 스케일·이동)는 디코더가 해제한다
   (DecodedMesh에 노드 변환 필드가 없음). 다른 속성은 원래 타입·정규화 그대로, 단 인터리브는 밀집 배열로 복사한다.
   오차: 건물 ≤ 5 mm(양자화 그대로). 메모리: 건물 POSITION 6 → 12 B/정점(셀당 수백 KB) — 문제되면 M02에서 노드 변환 필드 추가 검토.
3. `boundsLocal`은 파이프라인 값(glTF accessor min/max × 노드 변환)을 쓰고, render는 정점을 순회하지 않고 경계 구·상자를 만든다.
4. **임시 경로**: `apps/game/src/debug/local-cells.ts`가 `readTkc` + three `GLTFLoader` + `meshoptimizer/decoder`로 glb를 메인 스레드에서
   파싱해 `CellPayload`를 만든다(world-mini 4셀, 부트 1회). 메인 스레드 4 ms 규칙(Hard Rule 8) 예외이며 **M02-T05에서 삭제**한다.
   지면 높이(`GroundQuery`)도 같은 파일이 `terrain.height`로 제공(물리 전 freecam 최소 높이 유지용).

## Consequences
- M02 디코드 워커는 같은 규약(이름·float32 POSITION·밀집 배열)으로 `DecodedMesh`를 만들면 render 변경 없이 교체된다.
- 파사드 셰이더(M03)는 `_bldg`/`_facade`/`uv` 이름으로 속성을 읽는다.

## Alternatives
- three 속성 이름을 계약으로: 디코더가 three 관례에 묶임 → 기각.
- 양자화 POSITION + `transform` 필드 추가: 메모리 절약되지만 M01에선 소비자가 render뿐이라 이득 작음 → M02에서 재검토.
