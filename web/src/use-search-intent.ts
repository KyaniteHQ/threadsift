import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

export function useSearchIntent(
  field: RefObject<HTMLInputElement | null>,
  ready: boolean,
  release: () => void,
): () => void {
  const wanted = useRef(false);

  useLayoutEffect(() => {
    if (ready && wanted.current) {
      wanted.current = false;
      field.current?.focus();
    }
  }, [field, ready]);

  return useCallback(() => {
    if (ready) {
      field.current?.focus();
    } else {
      wanted.current = true;
      release();
    }
  }, [field, ready, release]);
}
