// 조작 도움말(H — 왼쪽 아래): 모드별 [키, 동작] 줄. 재바인딩한 키는 설정에서, 패드가 있으면 패드 글자. 순수 함수(테스트).
import type { RebindAction, SettingsModel } from '../../api.ts';
import { keyLabel, keyOf } from '../keys.ts';

export interface HelpItem {
  keys: string;
  action: string;
}

type Spec = readonly (readonly [RebindAction | string, string, string?])[];

/** [키(재바인딩 액션 이름이면 설정 키) | 고정 글자, 동작 번역 키, 패드 글자]. */
const SPECS: Readonly<Record<string, Spec>> = {
  walk: [
    ['WASD', 'action.move', 'L'],
    ['sprint', 'action.sprint', 'L3'],
    ['pace', 'action.pace'],
    ['interact', 'action.interact', 'X'],
    ['toggleView', 'action.toggleView', 'R3'],
    ['freeCam', 'action.freeCam', 'Select+Y'],
    ['summon', 'action.summon', '◀'],
    ['summonBike', 'action.summonBike', '▶'],
  ],
  freecam: [
    ['WASD', 'action.move', 'L'],
    ['E / Q', 'action.flyUpDown', 'RB / LB'],
    ['Wheel', 'action.speed', '▲▼'],
    ['land', 'action.land', 'A'],
    ['freeCam', 'action.backToBody', 'Select+Y'],
  ],
  drive: [
    ['W', 'action.throttle', 'RT'],
    ['S', 'action.brake', 'LT'],
    ['A / D', 'action.steer', 'L'],
    ['Space', 'action.handbrake', 'A'],
    ['lights', 'action.lights', '▲'],
    ['Q / E', 'action.indicators', '◀ / ▶'],
    ['toggleView', 'action.toggleView', 'R3'],
    ['interact', 'action.leave', 'X'],
  ],
  cycle: [
    ['W', 'action.throttle', 'RT'],
    ['S', 'action.brakeOnly', 'LT'],
    ['A / D', 'action.steer', 'L'],
    ['B', 'action.bell', 'Y'],
    ['lights', 'action.lights', '▲'],
    ['toggleView', 'action.toggleView', 'R3'],
    ['interact', 'action.leave', 'X'],
  ],
  train: [
    ['toggleView', 'action.trainView', 'R3'],
    ['skip', 'action.skip'],
    ['interact', 'action.leaveTrain', 'X'],
    ['freeCam', 'action.freeCam', 'Select+Y'],
  ],
};

const COMMON: Spec = [
  ['map', 'action.map'],
  ['photo', 'action.photo'],
  ['Esc', 'action.pause', 'Start'],
  ['H', 'action.help'],
];

const REBINDABLE = new Set<string>([
  'interact',
  'toggleView',
  'freeCam',
  'sprint',
  'pace',
  'summon',
  'summonBike',
  'land',
  'lights',
  'skip',
  'map',
  'photo',
]);

export function helpItems(mode: string, s: Pick<SettingsModel, 'keys'>, pad: boolean): HelpItem[] {
  const spec = [...(SPECS[mode] ?? []), ...COMMON];
  const out: HelpItem[] = [];
  for (const [k, action, padKey] of spec) {
    if (pad && !padKey) continue;
    const keys = pad && padKey ? padKey : REBINDABLE.has(k) ? keyLabel(keyOf(s, k as RebindAction)) : k;
    out.push({ keys, action });
  }
  return out;
}
