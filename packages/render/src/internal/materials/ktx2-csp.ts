// KTX2Loader 워커를 CSP 호환으로(M03-T06, ADR-0032): 기본 init()은 트랜스코더 본문을 Blob 워커로 띄운다 → blob 워커는 페이지 CSP를 물려받고
// basis_transcoder(embind)는 `new Function`을 써서 staging CSP('unsafe-eval' 없음)에서 실패했다. 같은 출처 정적 부트스트랩 워커
// (`<basisPath>ktx2-worker.js`, 자체 CSP 헤더)를 띄우고 같은 본문을 메시지로 넘긴다. 본문 조립은 three r186 KTX2Loader.init()과 같다.
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export const KTX2_BOOTSTRAP_FILE = 'ktx2-worker.js';

/** KTX2Loader 내부(타입 선언 밖) — three r186 기준. 버전을 올리면 init() 구현과 대조할 것. */
interface LoaderInternals {
  init(): Promise<void>;
  transcoderPending: Promise<void> | null;
  transcoderBinary: ArrayBuffer | null;
  workerConfig: unknown;
  workerPool: { setWorkerCreator(f: () => Worker): void };
}

interface LoaderStatics {
  BasisWorker: () => void;
  EngineFormat: unknown;
  EngineType: unknown;
  TranscoderFormat: unknown;
  BasisFormat: unknown;
}

/** 워커 본문: KTX2Loader.init()이 Blob으로 만들던 것과 같은 순서. */
export function workerBody(transcoderJs: string): string {
  const s = KTX2Loader as unknown as LoaderStatics;
  const fn = s.BasisWorker.toString();
  return [
    '/* constants */',
    `let _EngineFormat = ${JSON.stringify(s.EngineFormat)}`,
    `let _EngineType = ${JSON.stringify(s.EngineType)}`,
    `let _TranscoderFormat = ${JSON.stringify(s.TranscoderFormat)}`,
    `let _BasisFormat = ${JSON.stringify(s.BasisFormat)}`,
    '/* basis_transcoder.js */',
    transcoderJs,
    '/* worker */',
    fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
  ].join('\n');
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
}

/** loader.init()을 부트스트랩 워커 방식으로 교체. basisPath = 트랜스코더·부트스트랩이 있는 경로('/basis/'). */
export function useBootstrapWorker(loader: KTX2Loader, basisPath: string): KTX2Loader {
  const l = loader as unknown as LoaderInternals;
  l.init = () => {
    l.transcoderPending ??= Promise.all([
      fetchOk(`${basisPath}basis_transcoder.js`).then((r) => r.text()),
      fetchOk(`${basisPath}basis_transcoder.wasm`).then((r) => r.arrayBuffer()),
    ]).then(([js, wasm]) => {
      const source = workerBody(js);
      l.transcoderBinary = wasm;
      l.workerPool.setWorkerCreator(() => {
        const worker = new Worker(`${basisPath}${KTX2_BOOTSTRAP_FILE}`);
        worker.postMessage({ type: 'sanpo-boot', source });
        const transcoderBinary = wasm.slice(0);
        worker.postMessage({ type: 'init', config: l.workerConfig, transcoderBinary }, [transcoderBinary]);
        return worker;
      });
    });
    return l.transcoderPending;
  };
  return loader;
}
