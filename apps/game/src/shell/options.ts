// 셸 옵션: 메뉴 모드(타이틀·포인터 잠금 풀림 = 일시정지) 여부와 저장소. 개발·테스트 URL(?debug=1·?view=·?spawn=·?mode=·?probe=)은 메뉴 없이 곧바로 게임.
// `?title=1` = 그래도 메뉴, `?title=0` = 메뉴 없이.
import type { BootFlags } from '../boot.ts';

export function menusEnabled(flags: BootFlags, q: URLSearchParams): boolean {
  const t = q.get('title');
  if (t === '1') return true;
  if (t === '0') return false;
  return !flags.debug && !flags.perf && !flags.view && !flags.spawn && !flags.mode && !flags.probe;
}

export function storageOf(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
