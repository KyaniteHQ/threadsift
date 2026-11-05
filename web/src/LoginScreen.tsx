import { useCallback } from "react";

import { type Attempt, logIn } from "./access-api.ts";
import { FIELDS, LOGIN } from "./access-text.ts";
import { Alert, AuthShell } from "./AuthShell.tsx";
import { PasswordField } from "./PasswordField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";

function useLogin(refresh: () => void) {
  const password = useField();
  const lock = useLock();
  const { fail, clear, value } = password;
  const { start, dismiss } = lock;

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        refresh();
      } else if (result.kind === "locked") {
        start(result.retryAfter);
      } else {
        clear();
        fail(result.kind === "wrong" ? LOGIN.wrong : LOGIN.unreachable);
      }
    },
    [clear, fail, refresh, start],
  );

  const run = useCallback(async () => {
    dismiss();
    fail(null);
    settle(await logIn(value));
  }, [dismiss, fail, settle, value]);

  return { password, lock, ...useSubmit(run, lock.locked) };
}

export function LoginScreen({ refresh }: Readonly<{ refresh: () => void }>) {
  const { password, lock, busy, onSubmit } = useLogin(refresh);
  useFocusOnMount(password);

  return (
    <AuthShell>
      <form className="stack" onSubmit={onSubmit}>
        <h1 className="auth-title">{LOGIN.title}</h1>
        <input type="text" name="username" autoComplete="username" value="owner" hidden readOnly />
        <PasswordField
          field={password}
          label={FIELDS.password}
          autoComplete="current-password"
          withToggle
        />
        <Alert text={lock.message} />
        <SwapButton
          label={LOGIN.signIn}
          busyLabel={LOGIN.signingIn}
          busy={busy}
          blocked={lock.locked}
        />
      </form>
    </AuthShell>
  );
}
