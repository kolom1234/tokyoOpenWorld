// PLATEAU 리더 진입점: 공통 타입 재수출 + 구현 선택. 채택안(ADR-0007) = citygml-sax. see docs/04-data-pipeline.md §4.2
import { createCityGmlSaxReader } from './citygml-sax.ts';
import { createNusamaiReader } from './nusamai.ts';
import type { PlateauReader } from './types.ts';

export { createCityGmlSaxReader, parseCityGmlString } from './citygml-sax.ts';
export { createNusamaiReader } from './nusamai.ts';
export type * from './types.ts';

/** 기본값 = ADR-0007 채택안. `nusamai`는 비교·회귀 확인용으로만 유지. */
export function createPlateauReader(impl: PlateauReader['name'] = 'citygml-sax'): PlateauReader {
  return impl === 'nusamai' ? createNusamaiReader() : createCityGmlSaxReader();
}
