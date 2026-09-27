// B안 PlateauReader: saxes 스트리밍 파서로 CityGML을 직접 읽는다(외부 바이너리 없음). see docs/adr/0007-plateau-reader.md
import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
import { CityGmlState, type SaxStats } from './citygml-sax-state.ts';
import type { NormalizedFeature, PlateauReader, PlateauReadOptions } from './types.ts';

/** 읽기 청크(1 MiB). 청크마다 모인 레코드를 내보내므로 메모리 상한 ≈ 청크 + 진행 중 건물 1동. */
const CHUNK_BYTES = 1 << 20;

export interface CityGmlSaxReader extends PlateauReader {
  /** 마지막 `read` 완료 후 통계(폴리곤 수, 텍스처 연결 수, 버린 링 수). */
  readonly lastStats: SaxStats | null;
}

export function createCityGmlSaxReader(): CityGmlSaxReader {
  let lastStats: SaxStats | null = null;
  return {
    name: 'citygml-sax',
    get lastStats() {
      return lastStats;
    },
    async *read(file: string, opts: PlateauReadOptions): AsyncIterable<NormalizedFeature> {
      const queue: NormalizedFeature[] = [];
      const state = new CityGmlState(opts.sourceId, (f) => queue.push(f));
      const parser = createParser(state);
      const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: CHUNK_BYTES });
      for await (const chunk of stream) {
        parser.write(chunk as string);
        yield* queue.splice(0);
      }
      parser.close();
      yield* queue.splice(0);
      lastStats = { ...state.stats };
    },
  };
}

/** 문자열 → 레코드 배열(테스트·소형 픽스처용). */
export function parseCityGmlString(xml: string, sourceId: string): NormalizedFeature[] {
  const out: NormalizedFeature[] = [];
  const parser = createParser(new CityGmlState(sourceId, (f) => out.push(f)));
  parser.write(xml).close();
  return out;
}

function createParser(state: CityGmlState): SaxesParser {
  // xmlns 해석 끔: 접두사 문자열 그대로 비교(PLATEAU 표준 접두사 고정). 속성은 문자열 값만 필요.
  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', (tag) => state.open(tag.name, tag.attributes as Record<string, string>));
  parser.on('closetag', (tag) => state.close(tag.name));
  parser.on('text', (t) => state.text(t));
  parser.on('error', (e) => {
    throw e;
  });
  return parser;
}
