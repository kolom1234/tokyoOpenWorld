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

/** 실시간 날씨(M09-T01 live — Open-Meteo, CC BY 4.0)가 켜지면 출처 줄에 덧붙인다. */
export const LIVE_WEATHER_CREDIT = ' · 날씨: Open-Meteo.com (CC BY 4.0)';

export function setLiveCredit(doc: Document, on: boolean): void {
  const el = doc.querySelector<HTMLElement>('.credits');
  if (el) el.textContent = CREDIT_LINE + (on ? LIVE_WEATHER_CREDIT : '');
}
