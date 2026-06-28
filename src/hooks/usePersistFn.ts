import { useRef } from "react";

type PersistableFn = (...args: never[]) => unknown;

/**
 * usePersistFn instead of useCallback to reduce cognitive load
 */
export function usePersistFn<T extends PersistableFn>(fn: T): T {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const persistFn = useRef<T | null>(null);
  if (!persistFn.current) {
    persistFn.current = function (...args: Parameters<T>): ReturnType<T> {
      return fnRef.current(...args) as ReturnType<T>;
    } as T;
  }

  return persistFn.current;
}
