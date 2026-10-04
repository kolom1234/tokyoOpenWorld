// 보행자 정체성(10 §4.2–4.3, M06-T04): 스폰 순번 seq → 결정론 난수 → 외형 씨앗(variant u16 — 베이스·밝기·키는 render가 고름)·걸음 속력·대기 클립·위상.
// tier A(DetourCrowd)·B(흐름)를 오갈 때 이 묶음(+ 목적지·횡단 상태)을 그대로 넘긴다 — 승강격 연속성. 소지품(가방·우산)은 ⚠️ 미구현(ADR-0064).
import { createRng, hash32, type Rng, WORLD_SEED } from '@sanpo/core';
import type { CrowdAgentsParams } from '../../api.ts';
import { CLIP } from './dummy.ts';
import type { CrossingHit, V3 } from './route.ts';

const KIND_PED = 0x70656441; // 'pedA'

export const STATE = { walk: 0, approach: 1, wait: 2, cross: 3, dwell: 4 } as const;

/** 두 tier가 공유하는 보행자 상태(이동 수단 — Detour 에이전트·꺾은선 — 은 각 tier가 가진다). */
export interface PedIdentity {
  seq: number;
  rng: Rng;
  variant: number;
  speed: number;
  idleClip: number;
  /** 보행·대기 클립 위상(0..1). */
  phase: number;
  yaw: number;
  state: number;
  dest: V3 | undefined;
  hit: CrossingHit | undefined;
  /** 횡단 가로 위치(−1..1, + = 진행 방향 오른쪽)·대기 깊이(m). */
  lat: number;
  depth: number;
  /** 대기 반응 남은 s · dwell 남은 s. */
  react: number;
  timer: number;
  /** 대기 중 바라볼 방향(xz 단위). */
  faceX: number;
  faceZ: number;
}

export function newIdentity(seq: number, p: CrowdAgentsParams): PedIdentity {
  const rng = createRng(hash32(WORLD_SEED, KIND_PED, seq));
  return {
    seq,
    rng,
    variant: Math.floor(rng.next() * 65536),
    speed: p.speed[0] + (p.speed[1] - p.speed[0]) * rng.next(),
    idleClip: rng.next() < p.phoneShare ? CLIP.phone : CLIP.idle,
    phase: rng.next(),
    yaw: rng.next() * Math.PI * 2,
    state: STATE.walk,
    dest: undefined,
    hit: undefined,
    lat: 0,
    depth: 0,
    react: 0,
    timer: 0,
    faceX: 0,
    faceZ: -1,
  };
}

/** 정체성만 복사(이동 수단 필드는 빼고). */
export function identityOf(a: PedIdentity): PedIdentity {
  return {
    seq: a.seq,
    rng: a.rng,
    variant: a.variant,
    speed: a.speed,
    idleClip: a.idleClip,
    phase: a.phase,
    yaw: a.yaw,
    state: a.state,
    dest: a.dest,
    hit: a.hit,
    lat: a.lat,
    depth: a.depth,
    react: a.react,
    timer: a.timer,
    faceX: a.faceX,
    faceZ: a.faceZ,
  };
}
