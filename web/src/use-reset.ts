import { useCallback, useState } from "react";

import { type Attempt, type Refusal, resetPassword } from "./access-api.ts";
import { RESET, SETUP } from "./access-text.ts";
import { LENGTH_PROBLEM, lengthProblem } from "./password-length.ts";
import { usePasswordVisibility } from "./PasswordField.tsx";
import { useField, useLock, useSubmit } from "./use-form.ts";

function codeMessage(result: Readonly<Refusal>): string | null {
  if (result.kind === "wrong") {
    return RESET.codeWrong;
  }

  if (result.kind === "used") {
    return RESET.used;
  }

  if (result.kind === "unavailable") {
    return result.reason === "missing" ? RESET.missing : RESET.short;
  }

  return null;
}

export function useReset(done: () => void) {
  const code = useField();
  const password = useField();
  const confirm = useField();
  const lock = useLock();
  const visibility = usePasswordVisibility();
  const [alert, setAlert] = useState<string | null>(null);

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        done();
      } else if (result.kind === "locked") {
        lock.start(result.retryAfter);
      } else if (result.kind === "password") {
        password.fail(LENGTH_PROBLEM[result.length]);
      } else {
        const message = codeMessage(result);

        if (message === null) {
          setAlert(result.kind === "no-owner" ? RESET.noOwner : RESET.failed);
        } else {
          code.fail(message);
        }
      }
    },
    [code, done, lock, password],
  );

  const run = useCallback(async () => {
    const problem = lengthProblem(password.value);
    const mismatch = password.value === confirm.value ? null : SETUP.passwordMismatch;
    code.fail(null);
    password.fail(problem);
    confirm.fail(problem === null ? mismatch : null);
    setAlert(null);
    lock.dismiss();

    if (problem === null && mismatch === null) {
      settle(await resetPassword(code.value, password.value));
    }
  }, [code, confirm, lock, password, settle]);

  return { code, password, confirm, lock, visibility, alert, ...useSubmit(run, lock.locked) };
}
