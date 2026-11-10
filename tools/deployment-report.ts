import { mkdirSync, renameSync, writeFileSync } from "node:fs";

import { CommandFailure, type Failure } from "./command-failure.ts";

export type DeploymentResult = Readonly<
  | { stage: string; result: "passed"; detail: string }
  | { stage: string; result: "failed"; failure: Failure }
>;

export function deploymentReport(
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
