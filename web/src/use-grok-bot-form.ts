import { useCallback } from "react";

import {
  GrokBotInputSchema,
  type GrokBotView,
  grokBotAddressOf,
} from "../../src/core/grok-bot-contract.ts";
import { removeGrokBot, saveGrokBot, testGrokBot } from "./grok-bot-api.ts";
import { GROK_BOT_TEXT, resultText } from "./grok-bot-text.ts";
import { type FieldState, useField } from "./use-form.ts";
import {
  type Task,
  outcomeOf,
  useAction,
  useActionButtons,
  useActionFlow,
} from "./use-settings-action.ts";

type Action = "save" | "test" | "remove";

const LABELS = {
  save: { label: GROK_BOT_TEXT.save, busyLabel: GROK_BOT_TEXT.saving },
  test: { label: GROK_BOT_TEXT.test, busyLabel: GROK_BOT_TEXT.testing },
  remove: { label: GROK_BOT_TEXT.remove, busyLabel: GROK_BOT_TEXT.removing },
} as const;

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

function useSave(view: Readonly<GrokBotView>, fields: Readonly<Fields>, changed: Changed): Task {
  const { address, key } = fields;
  const { fail: failAddress, set: setAddress } = address;
  const { fail: failKey, clear: clearKey } = key;

  return useCallback(async () => {
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
  }, [view, address, key, failAddress, setAddress, failKey, clearKey, changed]);
}

const test: Task = async () => {
  const result = await testGrokBot();

  return { kind: result === "ok" ? "ok" : "error", text: resultText(result) };
};

function useRemove({ address, key }: Readonly<Fields>, changed: Changed): Task {
  const { fail: failAddress, set: setAddress } = address;
  const { fail: failKey, clear: clearKey } = key;

  return useCallback(async () => {
    changed(await removeGrokBot());
    setAddress("");
    clearKey();
    failAddress(null);
    failKey(null);

    return { kind: "ok", text: GROK_BOT_TEXT.removed };
  }, [setAddress, clearKey, failAddress, failKey, changed]);
}

export function useGrokBotForm(view: GrokBotView, changed: Changed) {
  const address = useField(null, view.webhookUrl ?? "");
  const key = useField();
  const { flow, run } = useActionFlow<Action>(GROK_BOT_TEXT.failed);
  const fields = { address, key };

  const blocked = {
    save: view.key === "missing",
    test: view.key !== "usable",
    remove: !view.configured,
  } as const;

  const submit = useAction({
    run,
    action: "save",
    blocked: blocked.save,
    task: useSave(view, fields, changed),
  });

  const testNow = useAction({ run, action: "test", blocked: blocked.test, task: test });

  const removeNow = useAction({
    run,
    action: "remove",
    blocked: blocked.remove,
    task: useRemove(fields, changed),
  });

  const buttons = useActionButtons({
    check: "test",
    labels: LABELS,
    blocked,
    press: { check: testNow, remove: removeNow },
  });

  return {
    address,
    key,
    flow,
    result: outcomeOf(flow),
    busy: flow.kind === "running",
    buttons,
    keyRequired: keyIsRequired(view, address.value),
    submit,
  };
}
