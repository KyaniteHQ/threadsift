import { useState } from "react";

import type { SetupCodeProblem } from "../../src/core/setup-code.ts";
import { SETUP } from "./access-text.ts";
import { AuthShell } from "./AuthShell.tsx";
import { CodeStep } from "./CodeStep.tsx";
import { PasswordStep } from "./PasswordStep.tsx";
import type { SetupStep } from "./setup-step.ts";

function UnavailableBlock({ reason }: Readonly<{ reason: SetupCodeProblem }>) {
  return (
    <div role="alert" className="stack">
      <h1 className="auth-title">{reason === "missing" ? SETUP.missingTitle : SETUP.shortTitle}</h1>
      <p>{reason === "missing" ? SETUP.missingHelp : SETUP.shortHelp}</p>
      {reason === "missing" ? <pre className="cmd">{SETUP.missingCommand}</pre> : null}
    </div>
  );
}

function StepView({
  step,
  go,
  refresh,
  signedIn,
}: Readonly<{
  step: SetupStep;
  go: (step: SetupStep) => void;
  refresh: () => void;
  signedIn: () => void;
}>) {
  switch (step.name) {
    case "code":
    case "code-wrong":
      return <CodeStep wrong={step.name === "code-wrong"} go={go} exists={refresh} />;
    case "password":
      return <PasswordStep code={step.code} go={go} exists={refresh} done={signedIn} />;
    case "unavailable":
      return <UnavailableBlock reason={step.reason} />;
    default:
      return step satisfies never;
  }
}

export function SetupScreen({
  problem,
  refresh,
  signedIn,
}: Readonly<{ problem: SetupCodeProblem | null; refresh: () => void; signedIn: () => void }>) {
  const [step, setStep] = useState<SetupStep>(
    problem === null ? { name: "code" } : { name: "unavailable", reason: problem },
  );

  return (
    <AuthShell>
      <StepView step={step} go={setStep} refresh={refresh} signedIn={signedIn} />
    </AuthShell>
  );
}
