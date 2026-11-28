import { useCallback, useMemo } from "react";

import { outcomeOf, useActionFlow } from "./use-settings-action.ts";

export type Saved<View> =
  | { readonly kind: "saved"; readonly view: View }
  | { readonly kind: "refused"; readonly text: string };

export function useSaveOnPick<Value, View>(
  save: (value: Value) => Promise<Saved<View>>,
  changed: (view: View) => void,
  failedText: string,
) {
  const { flow, run } = useActionFlow(useMemo(() => ({ save: failedText }), [failedText]));

  const pick = useCallback(
    (value: Value) => {
      void run("save", async () => {
        const saved = await save(value);

        if (saved.kind === "refused") return { kind: "error", text: saved.text };

        changed(saved.view);

        return null;
      });
    },
    [changed, run, save],
  );

  const outcome = outcomeOf(flow);

  return {
    busy: flow.kind === "running",
    error: outcome?.kind === "error" ? outcome.text : null,
    pick,
  };
}
