import { useCallback } from "react";

import { type Attempt, checkSetupCode } from "./access-api.ts";
import { SETUP } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { CodeText } from "./CodeText.tsx";
import { FormField } from "./FormField.tsx";
import type { GoTo } from "./setup-step.ts";
import { SwapButton } from "./SwapButton.tsx";
import { useField, useFocusOnMount, useLock, useSubmit } from "./use-form.ts";
import { useOutcome } from "./use-outcome.ts";

const CODE_INPUT = {
  name: "setup-code",
  type: "text",
  autoComplete: "one-time-code",
  mono: true,
} as const;

export interface CodeStepProps {
  readonly wrong: boolean;
  readonly go: GoTo;
  readonly exists: () => void;
}

function useCodeStep({ wrong, go, exists }: Readonly<CodeStepProps>) {
  const code = useField(wrong ? SETUP.codeWrong : null);
  const lock = useLock();
  const { fail, value } = code;
  const { start, dismiss } = lock;

  const failed = useCallback(() => {
    fail(SETUP.failed);
  }, [fail]);

  const refuse = useOutcome({ locked: start, failed, go, exists });

  const settle = useCallback(
    (result: Attempt) => {
      if (result.kind === "ok") {
        go({ name: "password", code: value });
      } else if (result.kind === "wrong") {
        fail(SETUP.codeWrong);
      } else {
        refuse(result);
      }
    },
    [fail, go, refuse, value],
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
  useFocusOnMount(code.ref);

  return (
    <form className="stack" method="post" onSubmit={onSubmit}>
      <p className="label">{SETUP.stepOne}</p>
      <h1 className="auth-title">{SETUP.codeTitle}</h1>
      <div className="help-pair">
        <p className="fld-help">
          <CodeText text={SETUP.codeWhereContainer} />
        </p>
        <p className="fld-help">
          <CodeText text={SETUP.codeWhereWorker} />
        </p>
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
