// @sanpo/tile-format 공개 계약 — 셀 audio.json(05 §4)·오디오 manifest(빌드 shared/audio/manifest.json, M09-T04 — ADR-0079). api.ts가 재수출한다.
/** api.ts Vec3Tuple과 같은 모양(순환 import 방지로 따로 둔다). */
type Vec3Tuple = [number, number, number];

/** 앰비언스 존 종류(11 §2 + street = 기본 도심 거리). 번호 없이 이름 — 모르는 종류는 런타임이 street로 본다. */
export const AUDIO_ZONE_KINDS = ['street', 'crossing', 'station', 'shopping', 'alley', 'park', 'elevated'] as const;
export type AudioZoneKind = (typeof AUDIO_ZONE_KINDS)[number];

export interface AudioZone {
  kind: AudioZoneKind;
  /** 셀 로컬 xz 다각형(파이프라인 = 32 m 격자 행 단위 직사각형). */
  polygonLocal: [number, number][];
  y0: number;
  y1: number;
}

/** 발음체 종류: signalTone = 음향식 보행 신호(유도음 — 런타임 합성, code = props.inst 신호 코드). */
export const AUDIO_EMITTER = { signalTone: 'signalTone' } as const;

export interface AudioEmitter {
  kind: string;
  /** 셀 로컬. */
  pos: Vec3Tuple;
  /** signalTone: 신호 코드(교차로 ID × 16 + 계획 × 4 + 그룹). */
  code?: number;
}

export interface AudioZones {
  zones: AudioZone[];
  emitters: AudioEmitter[];
}

/** 녹음 원천 출처(manifest.credits — 크레딧 화면·ATTRIBUTION과 같은 내용). */
export interface AudioCredit {
  id: string;
  title: string;
  author: string;
  license: string;
  url: string;
}

export interface AudioManifestEntry {
  /** manifest와 같은 폴더의 파일 이름(Opus/OGG). */
  file: string;
  bytes: number;
  kind: 'bed' | 'steps';
  /** 재생 길이(s) — 베드 = 루프 길이. */
  durS: number;
  /** steps: [시작 s, 길이 s] × 걸음. */
  steps?: [number, number][];
  /** 원천 id(credits). */
  source: string;
}

export interface AudioManifest {
  schema: 1;
  /** 내용 해시(캐시 키). */
  hash: string;
  files: Record<string, AudioManifestEntry>;
  credits: AudioCredit[];
}
