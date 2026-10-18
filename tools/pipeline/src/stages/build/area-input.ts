// 영역 빌드 입력(assemble.ts 400줄 제한으로 분리). see docs/04-data-pipeline.md
import type { CellKey, Logger } from '@sanpo/core';
import type { MarkingInput } from '../derive/markings/index.ts';
import type { PropCatalog } from '../derive/props/context.ts';
import type { DemWindow } from './dem-window.ts';
import type { AreaDef } from './manifest.ts';
import type { OverrideSet } from './overrides/index.ts';

export interface AreaBuildInput {
  area: AreaDef;
  cells: readonly CellKey[];
  buildId: string;
  /** `data/normalized`. */
  normalizedDir: string;
  /** `data/build/<buildId>` — 실행마다 비우고 다시 쓴다. */
  outDir: string;
  plateauSources: readonly string[];
  log: Logger;
  /** 테스트용: GDAL 없이 DEM 창 주입. */
  dem?: DemWindow;
  /** 소품 카탈로그(M05-T03, content/props/catalog.json). */
  props?: PropCatalog;
  /** 랜드마크 오버라이드(M05-T05, content/overrides). */
  overrides?: OverrideSet;
  /** OSM 횡단 선 보정(M06 사전 2, content/markings). */
  crossingCorrections?: MarkingInput['corrections'];
  /** 철도(M07-T01): 있으면 global/rail.bin을 먼저 만들고 셀 overrides.mesh에 선로 메시. */
  rail?: { repoRoot: string; derivedDir: string };
}
