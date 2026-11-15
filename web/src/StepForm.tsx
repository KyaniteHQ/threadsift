import { type ReactNode, type SubmitEvent, useId } from "react";

import { SETUP } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { SwapButton } from "./SwapButton.tsx";

export function StepForm({
  title,
  onSubmit,
  alert,
  submitLabel,
  busyLabel,
  busy,
  blocked,
  children,
  onBack,
}: Readonly<{
  title: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  alert: string | null;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  blocked: boolean;
  children: ReactNode;
  onBack?: () => void;
}>) {
  const titleId = useId();

  return (
    <form className="stack" method="post" aria-labelledby={titleId} onSubmit={onSubmit}>
      <h1 id={titleId} className="auth-title">
        {title}
      </h1>
      {children}
      <Alert text={alert} />
      <SwapButton label={submitLabel} busyLabel={busyLabel} busy={busy} blocked={blocked} />
      {onBack === undefined ? null : (
        <button
          type="button"
          className="btn btn-plain btn-flush"
          aria-disabled={busy ? true : undefined}
          onClick={onBack}
        >
          {SETUP.backToCode}
        </button>
      )}
    </form>
  );
}
