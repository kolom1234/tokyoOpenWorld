// POI 발견 판정(M10-T04, 10 §7): 반경 안에 연속 2 s 머물면 발견(freecam 제외 — 걷기·탈것·열차). 메인 스레드 순수 상태(1회 update = POI 수만큼 거리 계산).
// 발견 기록(시각·날씨)은 게임이 붙인다 — 여기서는 id만.
import type { PoiDef, PoiService } from '../../api.ts';

export const POI_DWELL_S = 2;

export function createPoiService(pois: readonly PoiDef[], dwellS = POI_DWELL_S): PoiService {
  const discovered = new Set<string>();
  const inside = new Map<string, number>();
  return {
    get discovered() {
      return discovered;
    },
    restore(ids) {
      for (const id of ids) if (pois.some((p) => p.id === id)) discovered.add(id);
    },
    update(posWF, mode, dtS) {
      const found: string[] = [];
      if (mode === 'freecam' || mode === 'idle') {
        inside.clear();
        return found;
      }
      for (const p of pois) {
        if (discovered.has(p.id)) continue;
        const d = Math.hypot(posWF.x - p.posWF.x, posWF.z - p.posWF.z);
        if (d > p.radiusM) {
          inside.delete(p.id);
          continue;
        }
        const t = (inside.get(p.id) ?? 0) + dtS;
        inside.set(p.id, t);
        if (t >= dwellS) {
          discovered.add(p.id);
          inside.delete(p.id);
          found.push(p.id);
        }
      }
      return found;
    },
  };
}
