import { useCallback, useMemo } from "react";

import { type RedditAccountView, redditSessionOf } from "../../src/core/reddit-account-contract.ts";
import {
  fetchRedditAccount,
  removeRedditAccount,
  saveRedditAccount,
  verifyRedditAccount,
} from "./reddit-account-api.ts";
import { REDDIT_ACCOUNT_TEXT, relayText, resultText } from "./reddit-account-text.ts";
import { askExtension } from "./reddit-relay.ts";
import { type FieldState, useField } from "./use-form.ts";
import {
  type ActionButton,
  type RunAction,
  type Task,
  outcomeOf,
  useAction,
  useActionButtons,
  useActionFlow,
  type Unavailable,
} from "./use-settings-action.ts";

type Action = "save" | "verify" | "remove" | "reconnect";

type Changed = (view: RedditAccountView) => void;

const RECONNECTABLE: ReadonlySet<RedditAccountView["state"]> = new Set([
  "none",
  "expired",
  "unreadable",
]);

const LABELS = {
  save: { label: REDDIT_ACCOUNT_TEXT.connect, busyLabel: REDDIT_ACCOUNT_TEXT.connecting },
  verify: { label: REDDIT_ACCOUNT_TEXT.verify, busyLabel: REDDIT_ACCOUNT_TEXT.verifying },
  remove: { label: REDDIT_ACCOUNT_TEXT.disconnect, busyLabel: REDDIT_ACCOUNT_TEXT.disconnecting },
} as const;

const EXTENSION_FIRST = {
  label: REDDIT_ACCOUNT_TEXT.connectExtension,
  busyLabel: REDDIT_ACCOUNT_TEXT.connectingExtension,
} as const;

const EXTENSION_AGAIN = {
  label: REDDIT_ACCOUNT_TEXT.reconnectExtension,
  busyLabel: REDDIT_ACCOUNT_TEXT.reconnectingExtension,
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

function useVerify(changed: Changed): Task {
  return useCallback(async () => {
    const result = await verifyRedditAccount();

    changed(await fetchRedditAccount());

    return { kind: result === "ok" ? "ok" : "error", text: resultText(result) };
  }, [changed]);
}

function useReconnect(changed: Changed): Task {
  return useCallback(async () => {
    const state = await askExtension();

    changed(await fetchRedditAccount());

    if (state === null) return { kind: "error", text: REDDIT_ACCOUNT_TEXT.extensionMissing };

    if (state !== "connected") return { kind: "error", text: relayText(state) };

    return { kind: "ok", text: relayText(state) };
  }, [changed]);
}

function useDisconnect(session: FieldState, changed: Changed): Task {
  const { fail, clear } = session;

  return useCallback(async () => {
    changed(await removeRedditAccount());
    clear();
    fail(null);

    return { kind: "ok", text: REDDIT_ACCOUNT_TEXT.disconnected };
  }, [fail, clear, changed]);
}

function verifyUnavailable({ state }: Readonly<RedditAccountView>): Unavailable {
  switch (state) {
    case "none":
      return resultText("not-configured");
    case "missing":
      return resultText("secret-missing");
    case "connected":
    case "expired":
    case "unreadable":
      return null;
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

function removeUnavailable({ state }: Readonly<RedditAccountView>): Unavailable {
  return state === "none" ? REDDIT_ACCOUNT_TEXT.removeNothing : null;
}

function unavailableOf(view: Readonly<RedditAccountView>) {
  return {
    save: view.state === "missing" ? resultText("secret-missing") : null,
    verify: verifyUnavailable(view),
    remove: removeUnavailable(view),
  } as const;
}

function useExtensionButton(
  { state }: Readonly<RedditAccountView>,
  run: RunAction<Action>,
  changed: Changed,
) {
  const reconnectNow = useAction({
    run,
    action: "reconnect",
    unavailable: null,
    task: useReconnect(changed),
  });

  const labels = state === "none" ? EXTENSION_FIRST : EXTENSION_AGAIN;
  const offered = RECONNECTABLE.has(state);

  const extension = useMemo<readonly ActionButton<Action>[]>(
    () =>
      offered
        ? [
            {
              action: "reconnect",
              ...labels,
              blocked: false,
              onClick: reconnectNow,
              secondary: false,
            },
          ]
        : [],
    [offered, labels, reconnectNow],
  );

  return extension;
}

export function useRedditAccountForm(view: RedditAccountView, changed: Changed) {
  const session = useField();
  const { flow, run } = useActionFlow<Action>(REDDIT_ACCOUNT_TEXT.failed);
  const saved = view.state !== "none" && view.state !== "missing";

  const unavailable = unavailableOf(view);

  const submit = useAction({
    run,
    action: "save",
    unavailable: unavailable.save,
    task: useConnect(session, changed),
  });

  const verifyNow = useAction({
    run,
    action: "verify",
    unavailable: unavailable.verify,
    task: useVerify(changed),
  });

  const disconnectNow = useAction({
    run,
    action: "remove",
    unavailable: unavailable.remove,
    task: useDisconnect(session, changed),
  });

  const extension = useExtensionButton(view, run, changed);

  const buttons = useActionButtons({
    check: "verify",
    labels: LABELS,
    unavailable,
    press: { check: verifyNow, remove: disconnectNow },
    saveSecondary: extension.length > 0,
  });

  return {
    session,
    flow,
    result: outcomeOf(flow),
    busy: flow.kind === "running",
    buttons,
    extension,
    submit,
    saved,
  };
}
