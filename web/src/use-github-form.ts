import { useCallback, useMemo } from "react";

import { type GithubSettingsView, GithubTokenInputSchema } from "../../src/core/github-contract.ts";
import { removeGithubToken, saveGithubToken, verifyGithubToken } from "./github-api.ts";
import { GITHUB_TEXT, refusalText, verifiedText } from "./github-text.ts";
import type { ActionButton } from "./SettingsActions.tsx";
import { type FieldState, useField, useGuard } from "./use-form.ts";
import { type RunAction, useActionResult, useUnlessBlocked } from "./use-settings-action.ts";

type Action = "save" | "verify" | "remove";

type Run = RunAction<Action>;

type Changed = (view: GithubSettingsView) => void;

function useSave(token: FieldState, changed: Changed, run: Run) {
  const { value, fail, clear } = token;

  return useCallback(
    () =>
      run("save", async () => {
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
      }),
    [value, fail, clear, changed, run],
  );
}

function useVerify(run: Run) {
  return useCallback(
    () =>
      run("verify", async () => {
        const response = await verifyGithubToken();

        return response.kind === "verified"
          ? { kind: "ok", text: verifiedText(response.limit, response.remaining) }
          : { kind: "error", text: refusalText(response) };
      }),
    [run],
  );
}

function useRemove(token: FieldState, changed: Changed, run: Run) {
  const { fail, clear } = token;

  return useCallback(
    () =>
      run("remove", async () => {
        changed(await removeGithubToken());
        clear();
        fail(null);

        return { kind: "ok", text: GITHUB_TEXT.removed };
      }),
    [changed, clear, fail, run],
  );
}

export function useGithubForm(view: GithubSettingsView, changed: Changed) {
  const token = useField();
  const { action, result, run } = useActionResult<Action>(GITHUB_TEXT.failed);
  const { busy, guard } = useGuard();

  const blocked = {
    save: !view.secretReady,
    verify: !view.secretReady || view.token !== "saved",
    remove: view.token === "none",
  } as const;

  const verifyNow = useUnlessBlocked(blocked.verify, guard, useVerify(run));
  const removeNow = useUnlessBlocked(blocked.remove, guard, useRemove(token, changed, run));

  const buttons = useMemo<readonly ActionButton<Action>[]>(
    () => [
      {
        action: "save",
        label: GITHUB_TEXT.save,
        busyLabel: GITHUB_TEXT.saving,
        blocked: blocked.save,
      },
      {
        action: "verify",
        label: GITHUB_TEXT.verify,
        busyLabel: GITHUB_TEXT.verifying,
        blocked: blocked.verify,
        onClick: verifyNow,
      },
      {
        action: "remove",
        label: GITHUB_TEXT.remove,
        busyLabel: GITHUB_TEXT.removing,
        blocked: blocked.remove,
        onClick: removeNow,
      },
    ],
    [blocked.save, blocked.verify, blocked.remove, verifyNow, removeNow],
  );

  return {
    token,
    result,
    busy,
    action,
    blocked,
    buttons,
    submit: useUnlessBlocked(blocked.save, guard, useSave(token, changed, run)),
  };
}
