// 열차 절차 모델(M07-T03, 자체 제작 — ADR-0072): 차형(20 m 통근형·16 m 지하철형) × 칸 종류(중간·팬터그래프·앞 운전실·뒤 운전실) × LOD 0–2.
// 스테인리스 차체 + 노선색 띠(인스턴스 색)만 — 실존 회사 로고·차번·정확한 도색 없음. LOD0 = 창 구멍 + 차내(탑승·전면 전망), 1 = 유리 띠·대차, 2 = 상자.
// 칸 종류 번호 = sim CAR_KIND(중간 0·팬터그래프 1·앞 운전실 2·뒤 운전실 3), 차형 = sim CAR_TYPE.
import type { BufferGeometry } from 'three/webgpu';
import { VehicleBuilder as B } from '../vehicles/builder.ts';
import { carBody } from './body.ts';
import { CAR_DIMS, type CarLod, cabFront, pantograph, roof, underframe } from './parts.ts';

export const TRAIN_CAR_TYPES = 2;
export const TRAIN_CAR_KINDS = 4;

/** 칸 하나(로컬 원점 = 레일 윗면 칸 중심, −Z = 진행 방향). */
export function buildTrainGeometry(type: number, kind: number, lod: CarLod): BufferGeometry {
  const d = CAR_DIMS[type] ?? (CAR_DIMS[0] as (typeof CAR_DIMS)[number]);
  const b = new B();
  const cabEnds = kind === 2 ? [-1] : kind === 3 ? [1] : [];
  carBody(b, d, cabEnds, lod);
  roof(b, d, lod);
  underframe(b, d, lod);
  if (kind === 2) cabFront(b, d, -1, 'head', lod);
  if (kind === 3) cabFront(b, d, 1, 'tail', lod);
  if (kind === 1) pantograph(b, d, d.L / 2 - 4.5, lod);
  return b.build();
}

/** 삼각형 수(테스트·통계). */
export function trainTriangles(type: number, kind: number, lod: CarLod): number {
  const g = buildTrainGeometry(type, kind, lod);
  const n = (g.index?.count ?? 0) / 3;
  g.dispose();
  return n;
}
