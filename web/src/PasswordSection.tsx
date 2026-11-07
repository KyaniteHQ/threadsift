import { useCallback, useState } from "react";

import { type Attempt, changePassword } from "./access-api.ts";
import { FIELDS, PASSWORD, SETUP } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { LENGTH_PROBLEM, checkNewPassword } from "./password-length.ts";
import { PasswordField, UsernameHint, usePasswordVisibility } from "./PasswordField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useLock, useSubmit } from "./use-form.ts";

function usePasswordChange() {
  const current = useField();
  const next = useField();
  const confirm = useField();
  const lock = useLock();
  const visibility = usePasswordVisibility();
  const [outcome, setOutcome] = useState<"changed" | "failed" | null>(null);

  const clearAll = useCallback(() => {
    current.clear();
    next.clear();
    confirm.clear();
    visibility.hide();
  }, [confirm, current, next, visibility]);

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        clearAll();
        setOutcome("changed");
      } else if (result.kind === "wrong") {
        current.clear();
        current.fail(PASSWORD.currentWrong);
      } else if (result.kind === "password") {
        next.fail(LENGTH_PROBLEM[result.length]);
      } else if (result.kind === "locked") {
        lock.start(result.retryAfter);
      } else {
        setOutcome("failed");
      }
    },
    [clearAll, current, lock, next],
  );

  const run = useCallback(async () => {
    current.fail(null);
    const usable = checkNewPassword(next, confirm);
    setOutcome(null);
    lock.dismiss();

    if (usable) {
      settle(await changePassword(current.value, next.value));
    }
  }, [confirm, current, lock, next, settle]);

  return { current, next, confirm, lock, visibility, outcome, ...useSubmit(run, lock.locked) };
}

export function PasswordSection() {
  const { current, next, confirm, lock, visibility, outcome, busy, onSubmit } = usePasswordChange();
  const { shown, toggle } = visibility;

  return (
    <section className="sec" aria-labelledby="password-title">
      <h2 id="password-title" className="rd-h">
        {PASSWORD.title}
      </h2>
      <p>{PASSWORD.note}</p>
      <form className="stack" method="post" onSubmit={onSubmit}>
        <UsernameHint />
        <PasswordField
          field={current}
          label={PASSWORD.current}
          name="current-password"
          autoComplete="current-password"
          shown={shown}
          toggle={toggle}
        />
        <PasswordField
          field={next}
          label={PASSWORD.new}
          name="new-password"
          autoComplete="new-password"
          help={SETUP.passwordHelp}
          shown={shown}
        />
        <PasswordField
          field={confirm}
          label={FIELDS.confirmPassword}
          name="confirm-password"
          autoComplete="new-password"
          shown={shown}
        />
        <Alert text={lock.message ?? (outcome === "failed" ? PASSWORD.failed : null)} />
        <output className="vh">{outcome === "changed" ? PASSWORD.changed : ""}</output>
        {outcome === "changed" ? <p aria-hidden="true">{PASSWORD.changed}</p> : null}
        <SwapButton
          label={PASSWORD.change}
          busyLabel={PASSWORD.changing}
          busy={busy}
          blocked={lock.locked}
        />
      </form>
    </section>
  );
}
