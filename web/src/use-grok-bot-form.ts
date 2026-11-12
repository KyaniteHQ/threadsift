import { useCallback, useState } from "react";

import { GrokBotInputSchema, type GrokBotView } from "../../src/core/grok-bot-contract.ts";
import { removeGrokBot, saveGrokBot, testGrokBot } from "./grok-bot-api.ts";
import { GROK_BOT_TEXT, resultText } from "./grok-bot-text.ts";
import { type FieldState, useField, useGuard } from "./use-form.ts";

type Action = "save" | "test" | "remove";

type Result =
  | null
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

type Run = (action: Action, task: () => Promise<Result>) => Promise<void>;

type Changed = (view: GrokBotView) => void;

interface Fields {
  readonly address: FieldState;
  readonly key: FieldState;
}

function useGrokBotResult() {
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<Result>(null);

  const run: Run = useCallback(async (next, task) => {
    setAction(next);
    setResult(null);

    try {
      setResult(await task());
    } catch {
      setResult({ kind: "error", text: GROK_BOT_TEXT.failed });
    }
  }, []);

  return { action, result, run };
}

function keyIsRequired(view: Readonly<GrokBotView>, address: string): boolean {
  return view.key !== "usable" || address.trim() !== view.webhookUrl;
}

function problemOf(
  view: Readonly<GrokBotView>,
  { address, key }: Readonly<Fields>,
): { readonly field: FieldState; readonly text: string } | null {
  const input = GrokBotInputSchema.safeParse({
    webhookUrl: address.value,
    key: key.value === "" ? undefined : key.value,
  });

  if (input.success) {
    return key.value === "" && keyIsRequired(view, address.value)
      ? { field: key, text: GROK_BOT_TEXT.keyNeeded }
      : null;
  }

  return input.error.issues.some(({ path }) => path[0] === "webhookUrl")
    ? { field: address, text: GROK_BOT_TEXT.invalidAddress }
    : { field: key, text: GROK_BOT_TEXT.invalidKey };
}

function useSave(
  view: Readonly<GrokBotView>,
  fields: Readonly<Fields>,
  changed: Changed,
  run: Run,
) {
  const { address, key } = fields;
  const { fail: failAddress } = address;
  const { fail: failKey, clear: clearKey } = key;

  return useCallback(
    () =>
      run("save", async () => {
        const problem = problemOf(view, { address, key });

        failAddress(null);
        failKey(null);

        if (problem !== null) {
          problem.field.fail(problem.text);

          return null;
        }

        const response = await saveGrokBot({
          webhookUrl: address.value.trim(),
          key: key.value === "" ? undefined : key.value,
        });

        if ("kind" in response) return { kind: "error", text: resultText(response.reason) };
        changed(response);
        clearKey();

        return { kind: "ok", text: GROK_BOT_TEXT.saved };
      }),
    [view, address, key, failAddress, failKey, clearKey, changed, run],
  );
}

function useTest(run: Run) {
  return useCallback(
    () =>
      run("test", async () => {
        const result = await testGrokBot();

        return { kind: result === "ok" ? "ok" : "error", text: resultText(result) };
      }),
    [run],
  );
}

function useRemove({ address, key }: Readonly<Fields>, changed: Changed, run: Run) {
  const { fail: failAddress, set: setAddress } = address;
  const { fail: failKey, clear: clearKey } = key;

  return useCallback(
    () =>
      run("remove", async () => {
        await removeGrokBot();
        changed({ configured: false, webhookUrl: null, key: "none" });
        setAddress("");
        clearKey();
        failAddress(null);
        failKey(null);

        return { kind: "ok", text: GROK_BOT_TEXT.removed };
      }),
    [setAddress, clearKey, failAddress, failKey, changed, run],
  );
}

function useUnlessBlocked(
  blocked: boolean,
  guard: (task: () => Promise<void>) => void,
  task: () => Promise<void>,
) {
  return useCallback(() => {
    if (!blocked) guard(task);
  }, [blocked, guard, task]);
}

export function useGrokBotForm(view: GrokBotView, changed: Changed) {
  const address = useField(null, view.webhookUrl ?? "");
  const key = useField();
  const { action, result, run } = useGrokBotResult();
  const { busy, guard } = useGuard();

  const blocked = {
    save: view.key === "missing",
    test: view.key !== "usable",
    remove: !view.configured,
  } as const;

  return {
    address,
    key,
    result,
    busy,
    action,
    blocked,
    keyRequired: keyIsRequired(view, address.value),
    submit: useUnlessBlocked(blocked.save, guard, useSave(view, { address, key }, changed, run)),
    testNow: useUnlessBlocked(blocked.test, guard, useTest(run)),
    removeNow: useUnlessBlocked(blocked.remove, guard, useRemove({ address, key }, changed, run)),
  };
}
