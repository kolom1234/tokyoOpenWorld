// 클립 표본(ADR-0057): Rocketbox 클립(같은 Biped 골격)의 리그 뼈 로컬 회전 + Bip01 위치를 아바타 골격에 얹어 fps마다 FK.
// 뼈 길이는 아바타 휴지값 그대로(회전만 옮김), 루트 높이는 Bip01 휴지 높이 비율로, 전진(루트 모션)은 선형 성분을 빼서 제자리 클립으로.
// 긴 대기 클립은 [B, L + B) 구간 + 끝 B초를 처음으로 교차 혼합해 길이 L 반복으로 자른다.
import { type Matrix4, Quaternion, Vector3 } from 'three';
import { type FbxAvatar, type FbxClip, interpolantOf } from './fbx.ts';
import { RIG_BONES, rigWorld } from './rig.ts';

export interface SampledClip {
  name: string;
  frames: number;
  durationS: number;
  /** 이 아바타 기준 자연 속력(m/s, 제자리 클립 = 0). */
  speedMs: number;
  /** frames × 리그 뼈 모델 공간 월드 행렬. */
  worlds: Matrix4[][];
}

interface Pose {
  q: Quaternion[];
  root: Vector3;
}

function interpolants(clip: FbxClip) {
  const byName = new Map(clip.clip.tracks.map((t) => [t.name, t]));
  const q = RIG_BONES.map((n) => {
    const t = byName.get(`${n}.quaternion`);
    return t ? interpolantOf(t) : undefined;
  });
  const rootTrack = byName.get('Bip01.position');
  if (!rootTrack) throw new Error('rocketbox clip: Bip01.position missing');
  return { q, root: interpolantOf(rootTrack) };
}

export function sampleClip(
  av: FbxAvatar,
  clip: FbxClip,
  o: { name: string; fps: number; trim?: { lengthS: number; blendS: number } },
): SampledClip {
  const ip = interpolants(clip);
  const dur = clip.clip.duration;
  const ratio = av.bone('Bip01').position.y / (clip.rootRestY || 1);
  const r0 = new Vector3().fromArray(ip.root.evaluate(0));
  const r1 = new Vector3().fromArray(ip.root.evaluate(dur));
  const drift = new Vector3(r1.x - r0.x, 0, r1.z - r0.z).divideScalar(dur);
  const poseAt = (t: number): Pose => {
    const q = ip.q.map((i, k) => {
      if (!i) return av.bone(RIG_BONES[k] as string).quaternion.clone();
      const v = i.evaluate(t);
      return new Quaternion(v[0], v[1], v[2], v[3]).normalize();
    });
    const r = new Vector3().fromArray(ip.root.evaluate(t));
    const root = new Vector3(r.x - r0.x - drift.x * t, r.y * ratio, r.z - r0.z - drift.z * t);
    return { q, root };
  };
  const trim = o.trim && dur > o.trim.lengthS + o.trim.blendS ? o.trim : undefined;
  const lengthS = trim ? trim.lengthS : dur;
  const frames = Math.max(1, Math.round(lengthS * o.fps));
  const worlds: Matrix4[][] = [];
  for (let f = 0; f < frames; f++) {
    const tau = (f / frames) * lengthS;
    let pose: Pose;
    if (!trim) pose = poseAt(tau);
    else {
      const a = poseAt(tau + trim.blendS);
      const w = Math.max(0, (tau - (trim.lengthS - trim.blendS)) / trim.blendS);
      if (w > 0) {
        const b = poseAt(tau + trim.blendS - trim.lengthS);
        a.q.forEach((q, k) => {
          q.slerp(b.q[k] as Quaternion, w);
        });
        a.root.lerp(b.root, w);
      }
      pose = a;
    }
    RIG_BONES.forEach((n, k) => {
      av.bone(n).quaternion.copy(pose.q[k] as Quaternion);
    });
    av.bone('Bip01').position.copy(pose.root);
    av.root.updateMatrixWorld(true);
    worlds.push(rigWorld(av));
  }
  const speedMs = Math.hypot(drift.x, drift.z) * 0.01 * ratio;
  return { name: o.name, frames, durationS: frames / o.fps, speedMs, worlds };
}

/** 아바타 휴지 자세 복원(클립 표본 뒤). */
export function restoreRest(av: FbxAvatar, rest: readonly { q: Quaternion; p: Vector3 }[]): void {
  RIG_BONES.forEach((n, k) => {
    const r = rest[k];
    if (!r) return;
    av.bone(n).quaternion.copy(r.q);
    av.bone(n).position.copy(r.p);
  });
  av.root.updateMatrixWorld(true);
}

export const captureRest = (av: FbxAvatar) =>
  RIG_BONES.map((n) => ({ q: av.bone(n).quaternion.clone(), p: av.bone(n).position.clone() }));
