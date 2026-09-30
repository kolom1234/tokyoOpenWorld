// 아바타 애니메이션(M05 결정 2): Quaternius UAL(같은 65관절 골격) 클립 중 대기·걷기·조깅·달리기를 몸 문서로 복사한다.
// 회전만 그대로(같은 휴지 방향), 이동은 pelvis만 휴지 차이로 옮김(골반 높이 = 다리 길이 차이 보정), 크기·다른 이동 채널은 버림(뼈 길이 = 몸 휴지 자세).
// 자연 속력 = 루트 모션판(_RM) root 이동 ÷ 길이 × (몸 키 ÷ 마네킹 키) — 렌더가 속력에 맞춰 재생 속도·블렌드를 정한다. see docs/adr/0048-quaternius-avatar.md
import type { Accessor, Animation, Document, Node } from '@gltf-transform/core';

/** 게임 이름 → UAL 클립 이름. */
export const AVATAR_CLIPS = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
} as const;
export type AvatarClip = keyof typeof AVATAR_CLIPS;

const PELVIS = 'pelvis';
const ROOT = 'root';

function byName(doc: Document): Map<string, Node> {
  return new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n] as const),
  );
}

function findClip(doc: Document, name: string): Animation {
  const a = doc
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === name);
  if (!a) throw new Error(`avatar: animation ${name} not found`);
  return a;
}

/** 루트 모션판에서 한 주기 root 이동 거리(m, 원본 단위) ÷ 길이(s). */
export function rootSpeed(rm: Document, clip: string): number {
  const ch = findClip(rm, clip)
    .listChannels()
    .find((c) => c.getTargetNode()?.getName() === ROOT && c.getTargetPath() === 'translation');
  const s = ch?.getSampler();
  const out = s?.getOutput();
  const inp = s?.getInput();
  if (!out || !inp || out.getCount() < 2) return 0;
  const a = out.getElement(0, []);
  const b = out.getElement(out.getCount() - 1, []);
  const dur = (inp.getMax([])[0] ?? 0) - (inp.getMin([])[0] ?? 0);
  return dur > 0 ? Math.hypot(...b.map((v, i) => v - (a[i] ?? 0))) / dur : 0;
}

function copyArray(doc: Document, src: Accessor, map?: (v: Float32Array) => void): Accessor {
  const arr = new Float32Array(src.getArray() as ArrayLike<number>);
  map?.(arr);
  return doc
    .createAccessor()
    .setType(src.getType())
    .setArray(arr)
    .setBuffer(doc.getRoot().listBuffers()[0] ?? null);
}

/** UAL 클립 하나를 몸 문서로(같은 시간 배열은 공유). 반환 = 채널 수. */
function copyClip(doc: Document, ual: Document, gameName: string, clipName: string): number {
  const nodes = byName(doc);
  const anim = doc.createAnimation(gameName);
  const times = new Map<Accessor, Accessor>();
  let n = 0;
  for (const ch of findClip(ual, clipName).listChannels()) {
    const srcNode = ch.getTargetNode();
    const path = ch.getTargetPath();
    const target = srcNode ? nodes.get(srcNode.getName()) : undefined;
    const s = ch.getSampler();
    const input = s?.getInput();
    const output = s?.getOutput();
    if (!target || !srcNode || !s || !input || !output) continue;
    const moveOk = path === 'translation' && srcNode.getName() === PELVIS;
    if (path !== 'rotation' && !moveOk) continue;
    const t = times.get(input) ?? copyArray(doc, input);
    times.set(input, t);
    const from = srcNode.getTranslation();
    const to = target.getTranslation();
    const out = copyArray(doc, output, (v) => {
      if (!moveOk) return;
      for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) - (from[i % 3] ?? 0) + (to[i % 3] ?? 0);
    });
    const sampler = doc.createAnimationSampler().setInput(t).setOutput(out).setInterpolation(s.getInterpolation());
    anim
      .addSampler(sampler)
      .addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler));
    n++;
  }
  return n;
}

export interface ClipInfo {
  name: AvatarClip;
  durationS: number;
  /** 자연 속력(m/s, 몸 원본 단위 — 렌더가 키 배율을 곱한다). */
  speedMs: number;
  channels: number;
}

/** 네 클립 복사 + 자연 속력(키 비율 = bodyHeight / ualHeight). */
export function copyAvatarClips(doc: Document, ual: Document, ualRm: Document, heightRatio: number): ClipInfo[] {
  return (Object.entries(AVATAR_CLIPS) as [AvatarClip, string][]).map(([name, clip]) => {
    const channels = copyClip(doc, ual, name, clip);
    const inp = findClip(ual, clip).listSamplers()[0]?.getInput();
    const durationS = (inp?.getMax([])[0] ?? 0) - (inp?.getMin([])[0] ?? 0);
    const speedMs = name === 'idle' ? 0 : rootSpeed(ualRm, clip) * heightRatio;
    return { name, durationS, speedMs, channels };
  });
}
