import { writeFileSync } from "node:fs";

import { z } from "zod";

import { Stop } from "./check-run.ts";
import { currentCopy } from "./copy-head.ts";
import { requiredEnv } from "./env.ts";
import { github } from "./github-request.ts";
import { Sha } from "./github.ts";

const GATE_PATH = ".github/workflows/gate.yml";

const GateRun = z.object({
  id: z.number().int(),
  head_sha: Sha,
  event: z.string(),
  conclusion: z.string().nullable(),
  path: z.string(),
  pull_requests: z.array(z.object({ number: z.number().int() })),
  head_repository: z.object({ full_name: z.string() }).nullable(),
});

export async function gateRunOf(pr: number, head: string): Promise<number> {
  const copy = await currentCopy(pr);
  const name = `pull request ${String(pr)}`;

  if (copy === null) throw new Stop(`${name} has no copy`);

  if (copy.head !== head) throw new Stop(`the copy of ${name} is at ${copy.head}, not ${head}`);

  if (copy.gateRun === null) {
    throw new Stop(`the record of the copy of ${name} names no gate run; deploy it again`);
  }

  const run = await github(`actions/runs/${String(copy.gateRun)}`, GateRun);

  if (
    run.head_sha !== head ||
    run.event !== "pull_request" ||
    run.conclusion !== "success" ||
    run.path !== GATE_PATH ||
    !run.pull_requests.some((pull) => pull.number === pr) ||
    run.head_repository?.full_name !== requiredEnv("GITHUB_REPOSITORY")
  ) {
    throw new Stop(`gate run ${String(run.id)} is not a successful gate of ${name} at ${head}`);
  }

  return run.id;
}

export async function writeGateRun(pr: number, head: string, out: string): Promise<void> {
  writeFileSync(out, `${String(await gateRunOf(pr, head))}\n`);
}
