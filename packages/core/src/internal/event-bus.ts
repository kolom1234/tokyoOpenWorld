// TypedEventBus: 동기 dispatch, 핸들러 예외 격리. 이벤트 목록은 ../events.ts. see docs/01-architecture.md §6
import type { EventBus, EventMap, EventName, Logger } from '../api.ts';

type AnyHandler = (p: never) => void;

export function createEventBus(log: Logger): EventBus {
  // copy-on-write 배열: emit 중 on/off가 일어나도 현재 dispatch 스냅샷은 불변이고 emit은 할당이 없다.
  const handlers = new Map<EventName, readonly AnyHandler[]>();

  return {
    on(k, h) {
      handlers.set(k, [...(handlers.get(k) ?? []), h as AnyHandler]);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const list = handlers.get(k) ?? [];
        const i = list.indexOf(h as AnyHandler);
        if (i >= 0) handlers.set(k, [...list.slice(0, i), ...list.slice(i + 1)]);
      };
    },
    emit<K extends EventName>(k: K, p: EventMap[K]) {
      const list = handlers.get(k);
      if (!list) return;
      for (const h of list) {
        try {
          (h as (p: EventMap[K]) => void)(p);
        } catch (e) {
          log.error(`handler for '${k}' threw`, e);
        }
      }
    },
  };
}
