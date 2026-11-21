import { useCallback } from "react";

import { type Attempt, logIn } from "./access-api.ts";
import { LOGIN } from "./access-text.ts";
import { usePasswordVisibility } from "./PasswordField.tsx";
import { useField, useSubmit } from "./use-form.ts";
import { useLock } from "./use-lock.ts";
import { useOutcome } from "./use-outcome.ts";

export function useLogin(signedIn: () => void) {
  const password = useField();
  const lock = useLock();
  const visibility = usePasswordVisibility();
  const { hide } = visibility;
  const { fail, clear, value } = password;
  const { start, dismiss } = lock;

  const failed = useCallback(() => {
    clear();
    hide();
    fail(LOGIN.unreachable);
  }, [clear, fail, hide]);

  const refuse = useOutcome({ locked: start, failed });

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        signedIn();
      } else if (result.kind === "wrong-password") {
        clear();
        hide();
        fail(LOGIN.wrong);
      } else {
        refuse(result);
      }
    },
    [clear, fail, hide, refuse, signedIn],
  );

  const run = useCallback(async () => {
    dismiss();
    fail(null);
    settle(await logIn(value));
  }, [dismiss, fail, settle, value]);

  return { password, lock, visibility, ...useSubmit(run, lock.locked) };
}
