import { mkdirSync, renameSync, writeFileSync } from "node:fs";

import { CommandFailure, type Failure } from "./command-failure.ts";

type DeploymentResult = Readonly<
  | { stage: string; result: "passed"; detail: string }
  | { stage: string; result: "failed"; failure: Failure }
>;

export interface DeploymentRun {
  readonly enter: (stage: string) => void;
  readonly own: (id: number) => void;
  readonly owned: () => number | undefined;
  readonly markSignedIn: () => void;
  readonly signedIn: () => boolean;
  readonly record: (detail: string) => void;
  readonly fail: (failure: Failure) => void;
}

function resultFile(
  directory: string,
  mode: string,
): (results: readonly DeploymentResult[]) => boolean {
  try {
    mkdirSync(directory, { mode: 0o700 });
  } catch {
    throw new CommandFailure({
      kind: "check",
      reason: "Output directory must be new",
      recovery:
        "Choose a fresh output directory beneath an existing parent; existing files are retained.",
    });
  }

  return (results) => {
    try {
      writeFileSync(`${directory}/result.tmp`, JSON.stringify({ mode, results }, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      renameSync(`${directory}/result.tmp`, `${directory}/result.json`);

      return true;
    } catch {
      return false;
    }
  };
}

export function deploymentRun(directory: string, mode: string): DeploymentRun {
  const save = resultFile(directory, mode);
  const results: DeploymentResult[] = [];
  let stage = "configuration";
  let ownedItem: number | undefined;
  let signedIn = false;

  return {
    enter: (next) => {
      stage = next;
    },
    own: (id) => {
      ownedItem = id;
    },
    owned: () => ownedItem,
    markSignedIn: () => {
      signedIn = true;
    },
    signedIn: () => signedIn,
    record: (detail) => {
      results.push({ stage, result: "passed", detail });

      if (!save(results))
        throw new CommandFailure({
          kind: "check",
          reason: "Result file could not be written",
          recovery: "Use the stderr report and rerun with a new private output directory.",
        });
    },
    fail: (failure) => {
      results.push({ stage, result: "failed", failure });
      const artifactSaved = save(results);

      console.error(
        JSON.stringify({ stage, ...failure, ownedItem: ownedItem ?? null, artifactSaved }),
      );
      process.exitCode = 1;
    },
  };
}
