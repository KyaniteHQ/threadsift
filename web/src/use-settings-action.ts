import { useCallback, useState } from "react";

export type ActionResult =
  | null
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

export type RunAction<Action extends string> = (
  action: Action,
  task: () => Promise<ActionResult>,
) => Promise<void>;

export function useActionResult<Action extends string>(failedText: string) {
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<ActionResult>(null);

  const run: RunAction<Action> = useCallback(
    async (next, task) => {
      setAction(next);
      setResult(null);

      try {
        setResult(await task());
      } catch {
        setResult({ kind: "error", text: failedText });
      }
    },
    [failedText],
  );

  return { action, result, run };
}

export function useUnlessBlocked(
  blocked: boolean,
  guard: (task: () => Promise<void>) => void,
  task: () => Promise<void>,
) {
  return useCallback(() => {
    if (!blocked) guard(task);
  }, [blocked, guard, task]);
}
