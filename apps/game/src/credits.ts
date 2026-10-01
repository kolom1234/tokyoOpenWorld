// 화면 오른쪽 아래 상시 출처 표기(03 §6 ODbL "Produced Work" 표기 — OSM 파생 노면 표시, M05-T02). M08 크레딧 화면·지도 하단 표기가 생기면 그쪽으로.
/** 짧은 표기(자세한 목록 = content/ATTRIBUTION.json). */
export const CREDIT_LINE = '© OpenStreetMap contributors · 3D都市モデル: 国土交通省 PLATEAU · 標高: 国土地理院';

export function mountCredits(doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'credits';
  el.textContent = CREDIT_LINE;
  doc.body.append(el);
  return el;
}
