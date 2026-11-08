import { useCallback, useState } from "react";

import { type GithubSettingsView, GithubTokenInputSchema } from "../../src/core/github-contract.ts";
import { removeGithubToken, saveGithubToken, verifyGithubToken } from "./github-api.ts";
import { GITHUB_TEXT, refusalText, verifiedText } from "./github-text.ts";
import { type FieldState, useField, useGuard } from "./use-form.ts";

type Action = "save" | "verify" | "remove";

type Result =
  | null
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

type Run = (action: Action, task: () => Promise<Result>) => Promise<void>;

type Changed = (view: GithubSettingsView) => void;

function useGithubResult() {
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<Result>(null);

  const run: Run = useCallback(async (next, task) => {
    setAction(next);
    setResult(null);

    try {
      setResult(await task());
    } catch {
      setResult({ kind: "error", text: GITHUB_TEXT.failed });
    }
  }, []);

  return { action, result, run };
}

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

function useUnlessBlocked(
  blocked: boolean,
  guard: (task: () => Promise<void>) => void,
  task: () => Promise<void>,
) {
  return useCallback(() => {
    if (!blocked) guard(task);
  }, [blocked, guard, task]);
}

export function useGithubForm(view: GithubSettingsView, changed: Changed) {
  const token = useField();
  const { action, result, run } = useGithubResult();
  const { busy, guard } = useGuard();

  const blocked = {
    save: !view.secretReady,
    verify: !view.secretReady || view.token !== "saved",
    remove: view.token === "none",
  } as const;

  return {
    token,
    result,
    busy,
    action,
    blocked,
    submit: useUnlessBlocked(blocked.save, guard, useSave(token, changed, run)),
    verifyNow: useUnlessBlocked(blocked.verify, guard, useVerify(run)),
    removeNow: useUnlessBlocked(blocked.remove, guard, useRemove(token, changed, run)),
  };
}
