import { useCallback } from "react";

import { type Attempt, checkSetupCode } from "./access-api.ts";
import { SETUP } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";
import { FormField } from "./FormField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";

const CODE_INPUT = {
  name: "setup-code",
  type: "text",
  autoComplete: "one-time-code",
  mono: true,
  placeholder: undefined,
} as const;

export type Unavailable = "missing" | "short";

export interface CodeStepProps {
  readonly wrongAtStart: boolean;
  readonly accepted: (code: string) => void;
  readonly unavailable: (reason: Unavailable) => void;
  readonly exists: () => void;
}

function useCodeStep({ wrongAtStart, accepted, unavailable, exists }: Readonly<CodeStepProps>) {
  const code = useField(wrongAtStart ? SETUP.codeWrong : null);
  const lock = useLock();
  const { fail, value } = code;
  const { start, dismiss } = lock;

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        accepted(value);
      } else if (result.kind === "wrong") {
        fail(SETUP.codeWrong);
      } else if (result.kind === "locked") {
        start(result.retryAfter);
      } else if (result.kind === "unavailable") {
        unavailable(result.reason);
      } else if (result.kind === "owner-exists") {
        exists();
      } else {
        fail(SETUP.failed);
      }
    },
    [accepted, exists, fail, start, unavailable, value],
  );

  const run = useCallback(async () => {
    dismiss();
    fail(null);
    settle(await checkSetupCode(value));
  }, [dismiss, fail, settle, value]);

  return { code, lock, ...useSubmit(run, lock.locked) };
}

export function CodeStep(props: Readonly<CodeStepProps>) {
  const { code, lock, busy, onSubmit } = useCodeStep(props);
  useFocusOnMount(code);

  return (
    <form className="stack" method="post" onSubmit={onSubmit}>
      <p className="label">{SETUP.stepOne}</p>
      <h1 className="auth-title">{SETUP.codeTitle}</h1>
      <div className="help-pair">
        <p className="fld-help">{SETUP.codeWhereContainer}</p>
        <p className="fld-help">{SETUP.codeWhereWorker}</p>
      </div>
      <FormField field={code} label={SETUP.codeLabel} kind={CODE_INPUT} />
      <Alert text={lock.message} />
      <SwapButton
        label={SETUP.continue}
        busyLabel={SETUP.checking}
        busy={busy}
        blocked={lock.locked}
      />
    </form>
  );
}
