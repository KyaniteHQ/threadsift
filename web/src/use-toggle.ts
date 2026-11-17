import { useCallback, useState } from "react";

export function useToggle(initial: boolean) {
  const [on, setOn] = useState(initial);

  const toggle = useCallback(() => {
    setOn((now) => !now);
  }, []);

  return [on, toggle] as const;
}
