import { useCallback } from "react";

import { FIELDS, LOGIN } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { AuthShell } from "./AuthShell.tsx";
import { useNavigate } from "./navigate-context.ts";
import { PasswordField, UsernameHint } from "./PasswordField.tsx";
import { RESET_PATH, useInternalLink } from "./routing.ts";
import { SwapButton } from "./SwapButton.tsx";
import { useFocusOnMount } from "./use-form.ts";
import { useLogin } from "./use-login.ts";

export function LoginScreen({
  signedIn,
  reset,
  forgetReset,
}: Readonly<{ signedIn: () => void; reset: boolean; forgetReset: () => void }>) {
  const { password, lock, visibility, busy, onSubmit } = useLogin(signedIn);
  const navigate = useNavigate();

  const follow = useInternalLink(
    useCallback(() => {
      forgetReset();
      navigate(RESET_PATH);
    }, [forgetReset, navigate]),
  );
  useFocusOnMount(password.ref);

  return (
    <AuthShell>
      <form className="stack" method="post" onSubmit={onSubmit}>
        <h1 className="auth-title">{LOGIN.heading}</h1>
        {reset ? <output>{LOGIN.resetDone}</output> : null}
        <UsernameHint />
        <PasswordField
          field={password}
          label={FIELDS.password}
          name="password"
          autoComplete="current-password"
          required
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
        <a className="btn btn-plain btn-flush" href={RESET_PATH} onClick={follow}>
          {LOGIN.lost}
        </a>
      </form>
    </AuthShell>
  );
}
