import { useCallback, useMemo } from "react";

import {
  GrokBotInputSchema,
  type GrokBotView,
  grokBotAddressOf,
} from "../../src/core/grok-bot-contract.ts";
import { removeGrokBot, saveGrokBot, testGrokBot } from "./grok-bot-api.ts";
import { GROK_BOT_TEXT, resultText } from "./grok-bot-text.ts";
import type { ActionButton } from "./SettingsActions.tsx";
import { type FieldState, useField, useGuard } from "./use-form.ts";
import { type RunAction, useActionResult, useUnlessBlocked } from "./use-settings-action.ts";

type Action = "save" | "test" | "remove";

type Run = RunAction<Action>;

type Changed = (view: GrokBotView) => void;

interface Fields {
  readonly address: FieldState;
  readonly key: FieldState;
}

function keyIsRequired(view: Readonly<GrokBotView>, address: string): boolean {
  return view.key !== "usable" || grokBotAddressOf(address) !== view.webhookUrl;
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
  const { fail: failAddress, set: setAddress } = address;
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
        setAddress(response.webhookUrl ?? "");
        clearKey();

        return { kind: "ok", text: GROK_BOT_TEXT.saved };
      }),
    [view, address, key, failAddress, setAddress, failKey, clearKey, changed, run],
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

function useRemove(
  view: Readonly<GrokBotView>,
  { address, key }: Readonly<Fields>,
  changed: Changed,
  run: Run,
) {
  const { fail: failAddress, set: setAddress } = address;
  const { fail: failKey, clear: clearKey } = key;

  return useCallback(
    () =>
      run("remove", async () => {
        await removeGrokBot();
        changed({
          configured: false,
          webhookUrl: null,
          key: view.key === "missing" ? "missing" : "none",
        });
        setAddress("");
        clearKey();
        failAddress(null);
        failKey(null);

        return { kind: "ok", text: GROK_BOT_TEXT.removed };
      }),
    [view.key, setAddress, clearKey, failAddress, failKey, changed, run],
  );
}

function useButtons(
  blocked: Readonly<Record<Action, boolean>>,
  testNow: () => void,
  removeNow: () => void,
) {
  return useMemo<readonly ActionButton<Action>[]>(
    () => [
      {
        action: "save",
        label: GROK_BOT_TEXT.save,
        busyLabel: GROK_BOT_TEXT.saving,
        blocked: blocked.save,
      },
      {
        action: "test",
        label: GROK_BOT_TEXT.test,
        busyLabel: GROK_BOT_TEXT.testing,
        blocked: blocked.test,
        onClick: testNow,
      },
      {
        action: "remove",
        label: GROK_BOT_TEXT.remove,
        busyLabel: GROK_BOT_TEXT.removing,
        blocked: blocked.remove,
        onClick: removeNow,
      },
    ],
    [blocked.save, blocked.test, blocked.remove, testNow, removeNow],
  );
}

export function useGrokBotForm(view: GrokBotView, changed: Changed) {
  const address = useField(null, view.webhookUrl ?? "");
  const key = useField();
  const { action, result, run } = useActionResult<Action>(GROK_BOT_TEXT.failed);
  const { busy, guard } = useGuard();

  const blocked = {
    save: view.key === "missing",
    test: view.key !== "usable",
    remove: !view.configured,
  } as const;

  const testNow = useUnlessBlocked(blocked.test, guard, useTest(run));

  const removeNow = useUnlessBlocked(
    blocked.remove,
    guard,
    useRemove(view, { address, key }, changed, run),
  );

  const buttons = useButtons(blocked, testNow, removeNow);

  return {
    address,
    key,
    result,
    busy,
    action,
    buttons,
    keyRequired: keyIsRequired(view, address.value),
    submit: useUnlessBlocked(blocked.save, guard, useSave(view, { address, key }, changed, run)),
  };
}
