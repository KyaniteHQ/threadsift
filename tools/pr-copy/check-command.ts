import { z } from "zod";

import { requireBundleBuild, writeBundleRun } from "./bundle-run.ts";
import { resumeOnly } from "./check-resume.ts";
import { DEFAULT_SCENARIOS, SCENARIO_NAMES } from "./check-types.ts";
import { runChecks } from "./checks.ts";
import { Sha } from "./github.ts";
import { MAX_REBUILDS, rebuildCopy } from "./rebuild.ts";

export { SCENARIO_NAMES };

interface Flags {
  readonly head?: string;
  readonly artifact?: string;
  readonly out?: string;
  readonly scenario?: readonly string[];
  readonly "workers-ai"?: boolean;
  readonly times?: string;
  readonly resume: boolean;
}

const Text = z.string().min(1);

function scenarioNames(flags: Readonly<Flags>): readonly string[] {
  const named = flags.scenario ?? DEFAULT_SCENARIOS;

  return flags["workers-ai"] === true && !named.includes("workers-ai")
    ? [...named, "workers-ai"]
    : named;
}

export async function checkCommand(pr: number, flags: Readonly<Flags>): Promise<void> {
  if (flags.resume) {
    const resumed = await resumeOnly(pr, scenarioNames(flags).includes("workers-ai"));
    process.stdout.write(
      `Delivery on the Queue of pull request ${String(pr)} ${resumed ? "was paused and is resumed" : "was not paused"}\n`,
    );

    return;
  }

  const options = {
    pr,
    head: Sha.parse(flags.head),
    artifact: Text.parse(flags.artifact),
    scenarios: z.array(z.enum(SCENARIO_NAMES)).parse(scenarioNames(flags)),
  };

  await requireBundleBuild(options);

  if (!(await runChecks(options, Text.parse(flags.out)))) process.exitCode = 1;
}

export async function bundleRunCommand(pr: number, flags: Readonly<Flags>): Promise<void> {
  await writeBundleRun(pr, Sha.parse(flags.head), Text.parse(flags.out));
}

export async function rebuildCommand(pr: number, flags: Readonly<Flags>): Promise<void> {
  const options = {
    pr,
    head: Sha.parse(flags.head),
    artifact: Text.parse(flags.artifact),
    times: z.coerce.number().int().min(1).max(MAX_REBUILDS).parse(flags.times),
  };

  await requireBundleBuild(options);

  if (!(await rebuildCopy(options, Text.parse(flags.out)))) process.exitCode = 1;
}
