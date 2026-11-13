import { useCallback } from "react";

import { type RedditAccountView, redditSessionOf } from "../../src/core/reddit-account-contract.ts";
import {
  removeRedditAccount,
  saveRedditAccount,
  verifyRedditAccount,
} from "./reddit-account-api.ts";
import { REDDIT_ACCOUNT_TEXT, resultText } from "./reddit-account-text.ts";
import { type FieldState, useField } from "./use-form.ts";
import {
  type Task,
  outcomeOf,
  useAction,
  useActionButtons,
  useActionFlow,
} from "./use-settings-action.ts";

type Action = "save" | "verify" | "remove";

type Changed = (view: RedditAccountView) => void;

const LABELS = {
  save: { label: REDDIT_ACCOUNT_TEXT.connect, busyLabel: REDDIT_ACCOUNT_TEXT.connecting },
  verify: { label: REDDIT_ACCOUNT_TEXT.verify, busyLabel: REDDIT_ACCOUNT_TEXT.verifying },
  remove: { label: REDDIT_ACCOUNT_TEXT.disconnect, busyLabel: REDDIT_ACCOUNT_TEXT.disconnecting },
} as const;

function useConnect(session: FieldState, changed: Changed): Task {
  const { fail, clear, value } = session;

  return useCallback(async () => {
    fail(null);

    if (value === "") {
      fail(REDDIT_ACCOUNT_TEXT.valueNeeded);

      return null;
    }

    if (redditSessionOf(value) === null) {
      fail(REDDIT_ACCOUNT_TEXT.invalidValue);

      return null;
    }

    const response = await saveRedditAccount(value);

    if ("kind" in response) {
      return { kind: "error", text: resultText(response.reason) };
    }

    changed(response);
    clear();

    return { kind: "ok", text: REDDIT_ACCOUNT_TEXT.connected };
  }, [fail, clear, value, changed]);
}

const verify: Task = async () => {
  const result = await verifyRedditAccount();

  return { kind: result === "ok" ? "ok" : "error", text: resultText(result) };
};

function useDisconnect(session: FieldState, changed: Changed): Task {
  const { fail, clear } = session;

  return useCallback(async () => {
    changed(await removeRedditAccount());
    clear();
    fail(null);

    return { kind: "ok", text: REDDIT_ACCOUNT_TEXT.disconnected };
  }, [fail, clear, changed]);
}

export function useRedditAccountForm(view: RedditAccountView, changed: Changed) {
  const session = useField();
  const { flow, run } = useActionFlow<Action>(REDDIT_ACCOUNT_TEXT.failed);
  const saved = view.state !== "none" && view.state !== "missing";

  const blocked = {
    save: view.state === "missing",
    verify: !saved,
    remove: view.state === "none" || view.state === "missing",
  } as const;

  const submit = useAction({
    run,
    action: "save",
    blocked: blocked.save,
    task: useConnect(session, changed),
  });

  const verifyNow = useAction({ run, action: "verify", blocked: blocked.verify, task: verify });

  const disconnectNow = useAction({
    run,
    action: "remove",
    blocked: blocked.remove,
    task: useDisconnect(session, changed),
  });

  const buttons = useActionButtons({
    check: "verify",
    labels: LABELS,
    blocked,
    press: { check: verifyNow, remove: disconnectNow },
  });

  return {
    session,
    flow,
    result: outcomeOf(flow),
    busy: flow.kind === "running",
    buttons,
    submit,
    saved,
  };
}
