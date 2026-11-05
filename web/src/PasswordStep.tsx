import { useCallback, useState } from "react";

import { type Attempt, setUp } from "./access-api.ts";
import { FIELDS, SETUP } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";
import type { Unavailable } from "./CodeStep.tsx";
import { PasswordField, UsernameHint, usePasswordVisibility } from "./PasswordField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { type FieldState, useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";

const MIN_CHARACTERS = 15;
const MAX_CHARACTERS = 1024;

export interface PasswordStepProps {
  readonly code: string;
  readonly back: () => void;
  readonly wrongCode: () => void;
  readonly unavailable: (reason: Unavailable) => void;
  readonly exists: () => void;
  readonly done: () => void;
}

function lengthProblem(password: string): string | null {
  const length = Array.from(password.normalize("NFKC")).length;

  if (length < MIN_CHARACTERS) {
    return SETUP.passwordTooShort;
  }

  return length > MAX_CHARACTERS ? SETUP.passwordTooLong : null;
}

function useServerOutcome(
  props: Readonly<PasswordStepProps>,
  password: FieldState,
  startLock: (seconds: number) => void,
) {
  const [failed, setFailed] = useState(false);
  const { wrongCode, unavailable, exists, done } = props;
  const { fail } = password;

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        done();
      } else if (result.kind === "password") {
        fail(result.length === "short" ? SETUP.passwordTooShort : SETUP.passwordTooLong);
      } else if (result.kind === "wrong") {
        wrongCode();
      } else if (result.kind === "locked") {
        startLock(result.retryAfter);
      } else if (result.kind === "unavailable") {
        unavailable(result.reason);
      } else if (result.kind === "owner-exists") {
        exists();
      } else {
        setFailed(true);
      }
    },
    [done, exists, fail, startLock, unavailable, wrongCode],
  );

  return { failed, setFailed, settle };
}

function usePasswordStep(props: Readonly<PasswordStepProps>) {
  const password = useField();
  const confirm = useField();
  const lock = useLock();
  const { failed, setFailed, settle } = useServerOutcome(props, password, lock.start);
  const { code } = props;

  const run = useCallback(async () => {
    const problem = lengthProblem(password.value);
    const mismatch = password.value === confirm.value ? null : SETUP.passwordMismatch;
    password.fail(problem);
    confirm.fail(problem === null ? mismatch : null);
    setFailed(false);
    lock.dismiss();

    if (problem === null && mismatch === null) {
      settle(await setUp(code, password.value));
    }
  }, [code, confirm, lock, password, setFailed, settle]);

  return { password, confirm, lock, failed, ...useSubmit(run, lock.locked) };
}

export function PasswordStep(props: Readonly<PasswordStepProps>) {
  const { password, confirm, lock, failed, busy, onSubmit } = usePasswordStep(props);
  const { shown, toggle } = usePasswordVisibility();
  useFocusOnMount(password);

  return (
    <form className="stack" method="post" onSubmit={onSubmit}>
      <p className="label">{SETUP.stepTwo}</p>
      <h1 className="auth-title">{SETUP.passwordTitle}</h1>
      <UsernameHint />
      <PasswordField
        field={password}
        label={FIELDS.password}
        name="password"
        autoComplete="new-password"
        help={SETUP.passwordHelp}
        shown={shown}
        toggle={toggle}
      />
      <PasswordField
        field={confirm}
        label={FIELDS.confirmPassword}
        name="confirm-password"
        autoComplete="new-password"
        shown={shown}
      />
      <Alert text={lock.message ?? (failed ? SETUP.failed : null)} />
      <SwapButton
        label={SETUP.create}
        busyLabel={SETUP.creating}
        busy={busy}
        blocked={lock.locked}
      />
      <button type="button" className="btn btn-plain btn-flush" onClick={props.back}>
        {SETUP.backToCode}
      </button>
    </form>
  );
}
