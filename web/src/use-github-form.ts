import { useCallback } from "react";

import { type GithubSettingsView, GithubTokenInputSchema } from "../../src/core/github-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { removeGithubToken, saveGithubToken, verifyGithubToken } from "./github-api.ts";
import { GITHUB_TEXT, TOKEN_STATES, refusalText, verifiedText } from "./github-text.ts";
import { type FieldState, useField } from "./use-form.ts";
import {
  type Task,
  outcomeOf,
  useAction,
  useActionButtons,
  useActionFlow,
} from "./use-settings-action.ts";

type Action = "save" | "verify" | "remove";

type Changed = (view: GithubSettingsView) => void;

const LABELS = {
  save: { label: GITHUB_TEXT.save, busyLabel: GITHUB_TEXT.saving },
  verify: { label: GITHUB_TEXT.verify, busyLabel: GITHUB_TEXT.verifying },
  remove: { label: GITHUB_TEXT.remove, busyLabel: GITHUB_TEXT.removing },
} as const;

function useSave(token: FieldState, changed: Changed): Task {
  const { value, fail, clear } = token;

  return useCallback(async () => {
    const input = GithubTokenInputSchema.safeParse({ token: value });

    if (!input.success) {
      fail(GITHUB_TEXT.invalidToken);

      return null;
    }

    fail(null);
    const response = await saveGithubToken(input.data);

    if ("kind" in response) return { kind: "error", text: refusalText(response) };
    changed(response);
    clear();

    return { kind: "ok", text: GITHUB_TEXT.saved };
  }, [value, fail, clear, changed]);
}

const verify: Task = async () => {
  const response = await verifyGithubToken();

  return response.kind === "verified"
    ? { kind: "ok", text: verifiedText(response.limit, response.remaining) }
    : { kind: "error", text: refusalText(response) };
};

function useRemove(token: FieldState, changed: Changed): Task {
  const { fail, clear } = token;

  return useCallback(async () => {
    changed(await removeGithubToken());
    clear();
    fail(null);

    return { kind: "ok", text: GITHUB_TEXT.removed };
  }, [changed, clear, fail]);
}

function verifyUnavailable(view: Readonly<GithubSettingsView>): string | null {
  if (!view.secretReady) return AI_TEXT["secret-missing"];

  if (view.token === "saved") return null;

  return view.token === "none" ? GITHUB_TEXT.notConfigured : TOKEN_STATES.unreadable;
}

export function useGithubForm(view: GithubSettingsView, changed: Changed) {
  const token = useField();
  const { flow, run } = useActionFlow<Action>(GITHUB_TEXT.failed);

  const unavailable = {
    save: view.secretReady ? null : AI_TEXT["secret-missing"],
    verify: verifyUnavailable(view),
    remove: view.token === "none" ? GITHUB_TEXT.removeNothing : null,
  } as const;

  const submit = useAction({
    run,
    action: "save",
    unavailable: unavailable.save,
    task: useSave(token, changed),
  });

  const verifyNow = useAction({
    run,
    action: "verify",
    unavailable: unavailable.verify,
    task: verify,
  });

  const removeNow = useAction({
    run,
    action: "remove",
    unavailable: unavailable.remove,
    task: useRemove(token, changed),
  });

  const buttons = useActionButtons({
    check: "verify",
    labels: LABELS,
    unavailable,
    press: { check: verifyNow, remove: removeNow },
  });

  return {
    token,
    flow,
    result: outcomeOf(flow),
    busy: flow.kind === "running",
    secretMissing: unavailable.save !== null,
    buttons,
    submit,
  };
}
