import { mkdirSync, writeFileSync } from "node:fs";

import type { Failure } from "./command-failure.ts";

export type DeploymentResult = Readonly<
  | { stage: string; result: "passed"; detail: string }
  | { stage: string; result: "failed"; failure: Failure }
>;

export function deploymentReport(
  directory: string,
  mode: string,
): (results: readonly DeploymentResult[]) => boolean {
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  return (results) => {
    try {
      writeFileSync(`${directory}/result.json`, JSON.stringify({ mode, results }, null, 2), {
        mode: 0o600,
      });

      return true;
    } catch {
      return false;
    }
  };
}
