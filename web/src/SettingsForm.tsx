import { type ReactNode, type SubmitEvent, useCallback, useId, useState } from "react";

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
  const baseId = useId();
  const reasons = [...new Set(buttons.flatMap(({ hint }) => (hint === undefined ? [] : [hint])))];
  const reasonId = (reason: string) => `${baseId}-hint-${String(reasons.indexOf(reason))}`;

  return (
    <>
      <div className="ai-actions">
        {buttons.map(
          ({
            action,
            label,
            busyLabel,
            blocked,
            hint,
            reasonId: shownReason,
            onClick,
            secondary,
          }) => (
            <SwapButton
              key={action}
              label={label}
              busyLabel={busyLabel}
              busy={running === action}
              blocked={running !== null || blocked}
              type={onClick === undefined ? "submit" : "button"}
              onClick={hint === undefined ? onClick : undefined}
              secondary={secondary}
              describedBy={hint === undefined ? shownReason : reasonId(hint)}
            />
          ),
        )}
      </div>
      {reasons.map((reason) => (
        <p key={reason} id={reasonId(reason)} className="fld-help">
          {reason}
        </p>
      ))}
    </>
  );
}

function usePresses(outcome: Outcome | null): number {
  const [seen, setSeen] = useState({ outcome, presses: 0 });

  if (seen.outcome === outcome) return seen.presses;

  setSeen({ outcome, presses: seen.presses + 1 });

  return seen.presses + 1;
}

export function SettingsResult({ outcome }: Readonly<{ outcome: Outcome | null }>) {
  const presses = usePresses(outcome);
  const done = outcome?.kind === "ok" ? outcome.text : null;
  const failure = outcome?.kind === "error" ? outcome.text : null;

  return (
    <>
      <output>{done === null ? null : <span key={presses}>{done}</span>}</output>
      <p role="alert" className="fld-err">
        {failure === null ? null : <span key={presses}>{failure}</span>}
      </p>
    </>
  );
}
