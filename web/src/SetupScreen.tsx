import { useCallback, useMemo, useState } from "react";

import type { SetupCodeProblem } from "../../src/core/setup-code.ts";
import { SETUP } from "./access-text.ts";
import { AuthShell } from "./AuthShell.tsx";
import { CodeStep } from "./CodeStep.tsx";
import { Command } from "./Command.tsx";
import { PasswordStep } from "./PasswordStep.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import type { SetupStep } from "./setup-step.ts";
import { StartStep } from "./StartStep.tsx";

function UnavailableBlock({ reason }: Readonly<{ reason: SetupCodeProblem }>) {
  return (
    <div role="alert" className="stack">
      <h1 className="auth-title">{reason === "missing" ? SETUP.missingTitle : SETUP.shortTitle}</h1>
      <p>{reason === "missing" ? SETUP.missingHelp : SETUP.shortHelp}</p>
      {reason === "missing" ? <Command text={SETUP.missingCommand} /> : null}
    </div>
  );
}

const LIBRARY_ADDRESS = "/";

const BACKUP_ADDRESS = `${SETTINGS_PATH}#backup`;

interface Exits {
  readonly refresh: () => void;
  readonly created: () => void;
  readonly startEmpty: () => void;
  readonly startRestore: () => void;
}

function StepView({
  step,
  go,
  exits,
}: Readonly<{ step: SetupStep; go: (step: SetupStep) => void; exits: Exits }>) {
  switch (step.name) {
    case "code":
    case "code-wrong":
      return <CodeStep wrong={step.name === "code-wrong"} go={go} exists={exits.refresh} />;
    case "password":
      return <PasswordStep code={step.code} go={go} exists={exits.refresh} done={exits.created} />;
    case "start":
      return <StartStep startEmpty={exits.startEmpty} startRestore={exits.startRestore} />;
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
  navigate,
}: Readonly<{
  problem: SetupCodeProblem | null;
  refresh: () => void;
  signedIn: () => void;
  navigate: (to: string) => void;
}>) {
  const [step, setStep] = useState<SetupStep>(
    problem === null ? { name: "code" } : { name: "unavailable", reason: problem },
  );

  const created = useCallback(() => {
    setStep({ name: "start" });
  }, []);

  const leaveTo = useCallback(
    (address: string) => () => {
      navigate(address);
      signedIn();
    },
    [navigate, signedIn],
  );

  const exits = useMemo<Exits>(
    () => ({
      refresh,
      created,
      startEmpty: leaveTo(LIBRARY_ADDRESS),
      startRestore: leaveTo(BACKUP_ADDRESS),
    }),
    [refresh, created, leaveTo],
  );

  return (
    <AuthShell>
      <StepView step={step} go={setStep} exits={exits} />
    </AuthShell>
  );
}
