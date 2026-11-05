import { useCallback } from "react";

import { type Attempt, logIn } from "./access-api.ts";
import { FIELDS, LOGIN } from "./access-text.ts";
import { Alert, AuthShell } from "./AuthShell.tsx";
import { PasswordField, UsernameHint, usePasswordVisibility } from "./PasswordField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";
import { useOutcome } from "./use-outcome.ts";

function useLogin(signedIn: () => void) {
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
      } else if (result.kind === "wrong") {
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

export function LoginScreen({ signedIn }: Readonly<{ signedIn: () => void }>) {
  const { password, lock, visibility, busy, onSubmit } = useLogin(signedIn);
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
