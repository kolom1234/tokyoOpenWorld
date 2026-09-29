# ADR-0042: 셀 콜라이더 — 청크로 자른 JCOL triMesh, 비용 예측 적재 큐, 버스 이벤트 배선, 양면 레이 (M04-T02)
- Status: Accepted
- Date: 2026-09-30

## Context
08 §4·04 §4.4-6: 파이프라인이 collision.bin(건물 simplify 0.3 m 삼각 메시 + 연석·소품·나무 줄기 프리미티브) 생성, 워커는 틱당 1셀 적재 큐, 수락 = 셀 적재 틱 ≤ 8 ms, 레이캐스트 ±5 cm.
실측(Node·Jolt wasm-compat): Jolt MeshShape 생성 ≈ 1.4–1.6 ms / 1000 삼각형(건물), 높이장 257² ≈ 2.4 ms(첫 호출 7). 셀당 건물 충돌 삼각형 5k–20k(world-mini) → 셀 하나를 한 틱에 만들면 8–30 ms.

## Decision
1. **파이프라인 `stages/build/collision.ts`**: 건물 렌더 면(벽·지붕·부속물) → 1 mm 용접(퇴화 제거) → meshopt `simplify`(목표 0, 절대 오차 0.3 m, `ErrorAbsolute`) →
   삼각형을 무게중심 64 m 블록(행 z·열 x) 순으로 정렬 → **≤ 2500 삼각형 청크**마다 JCOL triMesh 하나(쓰인 정점만, 레이어 STATIC_WORLD, 재질 concrete). JCOL 포맷은 그대로(v1, 셰이프 여러 개).
   TKC 헤더 `stats.colliderTris` 기록. 연석(M04-T04 도로 메시)·소품·나무 줄기 프리미티브(M05)는 데이터가 생길 때.
2. **워커 적재 큐**(`worker/cell-colliders.ts`): 셀 = [높이장 → triMesh 청크…] 작업, 작업마다 정적 바디 1개(userData = 재질, IndexedTriangle userData = 재질).
   틱마다 예산 4 ms 안에서 작업을 처리하되 **예상 비용**(높이장 3 ms, 메시 1.6 ms/1000 삼각형)이 남은 예산을 넘으면 다음 틱(첫 작업은 항상).
   셀의 작업이 끝나면 `cellLoaded` → `hasCell`. 초기화 때 작은 높이장·메시로 워밍업(첫 작업 콜드 비용 ≈ 7 ms 제거). 셰이프·목록은 wasm 힙에 직접 채움.
3. **높이장**: terrain.height u16 → HeightFieldShape(샘플 [iz·257 + ix] = 셀 로컬 (ix, h, iz), 블록 4), 레이어 TERRAIN.
4. **레이캐스트는 삼각형 양면**(`CollideWithBackFaces`): PLATEAU 면 감김이 일관되지 않아 뒷면을 무시하면 바깥에서 쏜 레이가 벽을 통과(시험에서 54 m 오차). 캐릭터(M04-T03)도 같은 원칙.
5. **게임 배선 `wiring/streaming-physics.ts`**(phase 56): `streaming.onReady`는 렌더 배선이 단독 소유(payload 소유권 이전) → 버스 `cell/ready`·`onEvicted`로 live L0 추적,
   250 ms마다 플레이어 기준 물리 반경(도보 256·자전거 320·차량 512·열차 256, freecam·transition 256) 안 셀을 가까운 순으로 `requestSections(['collision.bin','terrain.height'])`(동시 2) → `addCell`,
   반경 × 1.25 밖·해제 → `removeCell`. 물리는 `showWorld`에서 스폰 앵커로 생성(초기화는 기다리지 않음).

## Consequences
- 수락: 실제 GPU Chrome(world-mini, WebGPU) 적재 틱 최대 **5.8 ms**, 8 ms 초과 0회. 레이: 지면(정수 샘플) 오차 ≤ 0.4 mm(Node·브라우저), 벽 = JCOL 삼각형 CPU 교차와 ±5 cm(Node).
  CI(SwiftShader)는 렌더가 모든 코어를 써 워커도 느려(최대 22 ms) 적재 틱은 기록만.
- 셀 크기 증가: world-mini 셀 +0.1–0.3 %(collision.bin gzip). MVP 재빌드 필요(dev 버킷 publish는 M04-T04 계단·연석 추가 뒤 한 번에).
- 단순화 0.3 m로 벽이 최대 0.3 m 안팎으로 움직일 수 있다(평면 벽은 거의 그대로) — 걷기에서 벽 관통·끼임이 보이면 오차를 낮춘다.

## 부록 A (2026-09-30, M04-T03 보행 검증 중 발견): MVP 적재 틱
MVP 재빌드(`?world=local`)에서 10분 보행 중 적재 틱 **최대 20.4 ms, 8 ms 초과 54회**(world-mini 5.8 ms). Node 벤치(MVP 30셀, 경합 없음): 높이장 257² p50 3.4·최대 9.0 ms,
2500 삼각형 청크 p50 4.6·최대 7.0 ms(1.9 ms/1000) → 브라우저에서 렌더와 CPU·전력(15 W 노트북)을 나눠 2–3배.
**수정**: 워커가 작업을 더 잘게 — 높이장 = 4×4 타일(65², 가장자리 샘플 공유 → 이음새 레이 오차 동일), triMesh = ≤ 600 삼각형 조각(쓰는 정점만 압축).
예상 비용 높이장 타일 0.3 ms·메시 2 ms/1000 삼각형. 파이프라인 청크(2500)는 그대로(재빌드 불필요).
결과(실제 GPU Chrome, MVP, 보행 봇 4분): 2×2 타일·800 삼각형 = 최대 8.65 ms·초과 1회 → **4×4·600 = 최대 6.18 ms·초과 0회**. Node 벤치(2×2·800): 높이장 타일 p50 1.1 ms, 메시 p50 1.8·최대 4.4 ms.
