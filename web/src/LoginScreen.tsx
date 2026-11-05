import { useCallback } from "react";

import { type Attempt, logIn } from "./access-api.ts";
import { FIELDS, LOGIN } from "./access-text.ts";
import { Alert, AuthShell } from "./AuthShell.tsx";
import { PasswordField, UsernameHint, usePasswordVisibility } from "./PasswordField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";

function useLogin(refresh: () => void) {
  const password = useField();
  const lock = useLock();
  const visibility = usePasswordVisibility();
  const { hide } = visibility;
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
        hide();
        fail(result.kind === "wrong" ? LOGIN.wrong : LOGIN.unreachable);
      }
    },
    [clear, fail, hide, refresh, start],
  );

  const run = useCallback(async () => {
    dismiss();
    fail(null);
    settle(await logIn(value));
  }, [dismiss, fail, settle, value]);

  return { password, lock, visibility, ...useSubmit(run, lock.locked) };
}

export function LoginScreen({ refresh }: Readonly<{ refresh: () => void }>) {
  const { password, lock, visibility, busy, onSubmit } = useLogin(refresh);
  useFocusOnMount(password);

  return (
    <AuthShell>
      <form className="stack" method="post" onSubmit={onSubmit}>
        <h1 className="auth-title">{LOGIN.heading}</h1>
        <UsernameHint />
        <PasswordField
          field={password}
          label={FIELDS.password}
          name="password"
          autoComplete="current-password"
          shown={visibility.shown}
          toggle={visibility.toggle}
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
