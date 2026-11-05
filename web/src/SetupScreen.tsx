import { useCallback, useState } from "react";

import { SETUP } from "./access-text.ts";
import { AuthShell } from "./AuthShell.tsx";
import { CodeStep, type Unavailable } from "./CodeStep.tsx";
import { PasswordStep } from "./PasswordStep.tsx";

type Step =
  | { readonly name: "code"; readonly wrong: boolean }
  | { readonly name: "password"; readonly code: string }
  | { readonly name: "unavailable"; readonly reason: Unavailable };

function UnavailableBlock({ reason }: Readonly<{ reason: Unavailable }>) {
  return (
    <div role="alert" className="stack">
      <h1 className="auth-title">{reason === "missing" ? SETUP.missingTitle : SETUP.shortTitle}</h1>
      <p>{reason === "missing" ? SETUP.missingHelp : SETUP.shortHelp}</p>
      {reason === "missing" ? <pre className="code">{SETUP.missingCommand}</pre> : null}
    </div>
  );
}

function useSteps() {
  const [step, setStep] = useState<Step>({ name: "code", wrong: false });

  const accepted = useCallback((code: string) => {
    setStep({ name: "password", code });
  }, []);

  const unavailable = useCallback((reason: Unavailable) => {
    setStep({ name: "unavailable", reason });
  }, []);

  const toCode = useCallback(() => {
    setStep({ name: "code", wrong: false });
  }, []);

  const toWrongCode = useCallback(() => {
    setStep({ name: "code", wrong: true });
  }, []);

  return { step, accepted, unavailable, toCode, toWrongCode };
}

export function SetupScreen({ refresh }: Readonly<{ refresh: () => void }>) {
  const { step, accepted, unavailable, toCode, toWrongCode } = useSteps();

  return (
    <AuthShell>
      {step.name === "code" ? (
        <CodeStep
          wrongAtStart={step.wrong}
          accepted={accepted}
          unavailable={unavailable}
          exists={refresh}
        />
      ) : null}
      {step.name === "password" ? (
        <PasswordStep
          code={step.code}
          back={toCode}
          wrongCode={toWrongCode}
          unavailable={unavailable}
          exists={refresh}
          done={refresh}
        />
      ) : null}
      {step.name === "unavailable" ? <UnavailableBlock reason={step.reason} /> : null}
    </AuthShell>
  );
}
