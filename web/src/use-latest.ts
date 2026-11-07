import { useEffect, useRef } from "react";

export function useLatest<Value>(value: Value) {
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  return latest;
}
