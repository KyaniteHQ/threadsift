import { z } from "zod";

import { resumeOnly } from "./check-run.ts";
import { SCENARIO_NAMES } from "./check-types.ts";
import { runChecks } from "./checks.ts";
import { Sha } from "./github.ts";
import { MAX_REBUILDS, rebuildCopy } from "./rebuild.ts";

export { SCENARIO_NAMES };

interface Flags {
  readonly head?: string;
  readonly artifact?: string;
  readonly out?: string;
  readonly scenario?: readonly string[];
  readonly times?: string;
  readonly resume: boolean;
}

const Text = z.string().min(1);

export async function checkCommand(pr: number, flags: Readonly<Flags>): Promise<void> {
  if (flags.resume) {
    const resumed = await resumeOnly(pr);
    process.stdout.write(
      `Delivery on the Queue of pull request ${String(pr)} ${resumed ? "was paused and is resumed" : "was not paused"}\n`,
    );

    return;
  }

  const options = {
    pr,
    head: Sha.parse(flags.head),
    artifact: Text.parse(flags.artifact),
    scenarios: z.array(z.enum(SCENARIO_NAMES)).parse(flags.scenario ?? SCENARIO_NAMES),
  };

  if (!(await runChecks(options, Text.parse(flags.out)))) process.exitCode = 1;
}

export async function rebuildCommand(pr: number, flags: Readonly<Flags>): Promise<void> {
  const options = {
    pr,
    head: Sha.parse(flags.head),
    artifact: Text.parse(flags.artifact),
    times: z.coerce.number().int().min(1).max(MAX_REBUILDS).parse(flags.times),
  };

  if (!(await rebuildCopy(options, Text.parse(flags.out)))) process.exitCode = 1;
}
