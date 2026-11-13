import { type ReactNode, type SubmitEvent, useCallback } from "react";

import { Alert } from "./Alert.tsx";
import { SwapButton } from "./SwapButton.tsx";
import type { ActionButton, Outcome } from "./use-settings-action.ts";

export function SettingsForm({
  action,
  busy,
  noValidate,
  submit,
  children,
}: Readonly<{
  action: string;
  busy: boolean;
  noValidate?: true;
  submit: () => void;
  children: ReactNode;
}>) {
  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <form
      method="post"
      action={action}
      className="stack ai-form"
      onSubmit={onSubmit}
      aria-busy={busy}
      noValidate={noValidate}
    >
      {children}
    </form>
  );
}

export function SettingsActions<Action extends string>({
  running,
  buttons,
}: Readonly<{
  running: Action | null;
  buttons: readonly ActionButton<Action>[];
}>) {
  return (
    <div className="ai-actions">
      {buttons.map(({ action, label, busyLabel, blocked, onClick }) => (
        <SwapButton
          key={action}
          label={label}
          busyLabel={busyLabel}
          busy={running === action}
          blocked={running !== null || blocked}
          type={onClick === undefined ? "submit" : "button"}
          onClick={onClick}
          secondary={onClick !== undefined}
        />
      ))}
    </div>
  );
}

export function SettingsResult({ outcome }: Readonly<{ outcome: Outcome | null }>) {
  return (
    <>
      <output>{outcome?.kind === "ok" ? outcome.text : null}</output>
      <Alert text={outcome?.kind === "error" ? outcome.text : null} />
    </>
  );
}
