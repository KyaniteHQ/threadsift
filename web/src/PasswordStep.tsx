import { useCallback, useState } from "react";

import { type Attempt, setUp } from "./access-api.ts";
import { FIELDS, SETUP } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { LENGTH_PROBLEM, lengthProblem } from "./password-length.ts";
import { PasswordField, UsernameHint, usePasswordVisibility } from "./PasswordField.tsx";
import type { GoTo } from "./setup-step.ts";
import { SwapButton } from "./SwapButton.tsx";
import { type FieldState, useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";
import { useOutcome } from "./use-outcome.ts";

export interface PasswordStepProps {
  readonly code: string;
  readonly go: GoTo;
  readonly exists: () => void;
  readonly done: () => void;
}

function useServerOutcome(
  { code, go, exists, done }: Readonly<PasswordStepProps>,
  password: FieldState,
  startLock: (seconds: number) => void,
) {
  const [failed, setFailed] = useState(false);
  const { fail } = password;

  const showFailed = useCallback(() => {
    setFailed(true);
  }, []);

  const refuse = useOutcome({ locked: startLock, failed: showFailed, go, exists });

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        done();
      } else if (result.kind === "password") {
        fail(LENGTH_PROBLEM[result.length]);
      } else if (result.kind === "wrong") {
        go({ name: "code-wrong" });
      } else {
        refuse(result);
      }
    },
    [done, fail, go, refuse],
  );

  const check = useCallback(
    async (typed: string) => {
      settle(await setUp(code, typed));
    },
    [code, settle],
  );

  return { failed, setFailed, check };
}

function usePasswordStep(props: Readonly<PasswordStepProps>) {
  const password = useField();
  const confirm = useField();
  const lock = useLock();
  const { failed, setFailed, check } = useServerOutcome(props, password, lock.start);

  const run = useCallback(async () => {
    const problem = lengthProblem(password.value);
    const mismatch = password.value === confirm.value ? null : SETUP.passwordMismatch;
    password.fail(problem);
    confirm.fail(problem === null ? mismatch : null);
    setFailed(false);
    lock.dismiss();

    if (problem === null && mismatch === null) {
      await check(password.value);
    }
  }, [check, confirm, lock, password, setFailed]);

  return { password, confirm, lock, failed, ...useSubmit(run, lock.locked) };
}

export function PasswordStep(props: Readonly<PasswordStepProps>) {
  const { password, confirm, lock, failed, busy, onSubmit } = usePasswordStep(props);
  const { shown, toggle } = usePasswordVisibility();
  const { go } = props;

  const backToCode = useCallback(() => {
    go({ name: "code" });
  }, [go]);

  useFocusOnMount(password.ref);

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
      <button type="button" className="btn btn-plain btn-flush" onClick={backToCode}>
        {SETUP.backToCode}
      </button>
    </form>
  );
}
