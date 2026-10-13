// @sanpo/tile-format 공개 계약 — lights.bin(05 §4, M09-T03 — ADR-0078). api.ts가 재수출한다(api.ts 400줄 제한으로 분리).

/** 광원 종류(LightRecord.kind) — 번호는 추가만. */
export const LIGHT_KIND = {
  streetLamp: 1,
  shopFront: 2,
  sign: 3,
  vending: 4,
  platform: 5,
} as const;

/**
 * 점등 일정(LightRecord.schedule): night = 해 진 뒤~뜨기 전(가로등·승강장), shop = 영업 10–23시(+ 밤), sign = 해 진 뒤 ~ 25시, always = 상시(자판기 — 낮에는 약하게).
 * 렌더가 시각·태양으로 켜짐 비율을 정한다(render lighting/schedule.ts).
 */
export const LIGHT_SCHEDULE = {
  night: 0,
  shop: 1,
  sign: 2,
  always: 3,
} as const;

/** lights.bin 레코드 바이트: u8 kind, u8 schedule, u16 kelvin, f32 x,y,z, i8 × 2 dirOct, u16 lumen, f32 range. */
export const LIGHT_RECORD_BYTES = 24;
