// 오디오 원천 목록(M09-T04 — ADR-0079): content/audio/library.json. 녹음 원천은 CC0·CC BY만(사용자 결정 — BY-SA·NC·출처 불명 금지).
// see docs/11-audio.md §4, docs/03-data-sources.md
import { readFileSync } from 'node:fs';

/** 허용 라이선스(SPDX). 이 밖은 읽을 때 오류. */
export const AUDIO_LICENSES: ReadonlySet<string> = new Set(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']);

export interface AudioSource {
  id: string;
  freesound: number;
  /** 소리 페이지(출처 표기 URL). */
  url: string;
  /** 내려받을 파일(HQ 미리듣기 MP3). */
  preview: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
}

export interface AudioOutputBed {
  id: string;
  source: string;
  kind: 'bed';
  /** 루프 길이(s). */
  loopS: number;
  note?: string;
}
export interface AudioOutputSteps {
  id: string;
  source: string;
  kind: 'steps';
  maxSteps: number;
  note?: string;
}
export type AudioOutput = AudioOutputBed | AudioOutputSteps;

export interface AudioLibrary {
  schema: 1;
  sources: AudioSource[];
  outputs: AudioOutput[];
}

const ID_RE = /^[a-z0-9-]+$/;

/** 형식·라이선스·참조 검사. 문제가 있으면 throw(빌드 중단 — 출처 누락 0). */
export function checkAudioLibrary(lib: AudioLibrary): AudioLibrary {
  if (lib.schema !== 1) throw new Error(`audio library schema ${String(lib.schema)} ≠ 1`);
  const src = new Map<string, AudioSource>();
  for (const s of lib.sources) {
    if (!AUDIO_LICENSES.has(s.license)) throw new Error(`${s.id}: license ${s.license} not allowed`);
    if (!s.author || !s.title || !s.url.startsWith('https://')) throw new Error(`${s.id}: author/title/url missing`);
    if (!s.preview.startsWith('https://cdn.freesound.org/'))
      throw new Error(`${s.id}: preview must be a freesound CDN URL`);
    if (src.has(s.id)) throw new Error(`${s.id}: duplicate source`);
    src.set(s.id, s);
  }
  const seen = new Set<string>();
  for (const o of lib.outputs) {
    if (!ID_RE.test(o.id) || seen.has(o.id)) throw new Error(`output id "${o.id}" invalid or duplicate`);
    seen.add(o.id);
    if (!src.has(o.source)) throw new Error(`${o.id}: unknown source ${o.source}`);
    if (o.kind === 'bed' && !(o.loopS >= 10 && o.loopS <= 120)) throw new Error(`${o.id}: loopS out of range`);
    if (o.kind === 'steps' && !(o.maxSteps >= 2 && o.maxSteps <= 32)) throw new Error(`${o.id}: maxSteps out of range`);
  }
  return lib;
}

export function readAudioLibrary(path: string): AudioLibrary {
  return checkAudioLibrary(JSON.parse(readFileSync(path, 'utf8')) as AudioLibrary);
}

/** 원천 파일 이름(raw 디렉터리·lock 키). */
export function rawNameOf(s: AudioSource): string {
  return `${s.id}.mp3`;
}
