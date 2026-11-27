import { randomBytes } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { errnoCodeOf, report } from "../../core/kernel/failure-log.ts";
import { within } from "./cli-process.ts";
import { type Refused, refusalOf } from "./grok-answer.ts";
import { type RunFolders, inRunFolders } from "./grok-folders.ts";
import type { GrokCli } from "./grok-process.ts";
import {
  type PreflightResult,
  checkedRun,
  exitedCleanly,
  preflightResultOf,
} from "./grok-proof.ts";
import { PREFLIGHT_PROMPT, type ProbeTargets, probePrompt, toolsVerdict } from "./grok-surface.ts";

const TEST_RUN_MS = 60_000;
const PROBE_RUN_MS = 120_000;

export interface Trial {
  readonly result: PreflightResult;
  readonly failure: Refused | null;
}

function inconclusive(failure: Refused): Trial {
  return { result: { kind: "inconclusive" }, failure };
}

function judged(verdict: Parameters<typeof preflightResultOf>[0]): Trial {
  return { result: preflightResultOf(verdict), failure: null };
}

function testRun(cli: GrokCli, signal: AbortSignal): Promise<Trial | null> {
  return inRunFolders(async (folders) => {
    const run = await cli.run(folders, PREFLIGHT_PROMPT, within(signal, TEST_RUN_MS));
    const check = checkedRun(run);

    if (check.kind === "barred") return judged(check.verdict);

    if (check.kind === "surface-held" && exitedCleanly(run)) return null;

    return inconclusive(check.kind === "surface-held" ? refusalOf(run.end) : check.refusal);
  });
}

function probeTargets({ root, home }: Readonly<RunFolders>): ProbeTargets {
  return {
    written: [join(root, "probe-write.txt"), join(home, "probe-write.txt")],
    shell: join(root, "probe-shell.txt"),
    marker: join(home, "marker.txt"),
  };
}

type Seen = "acted" | "nothing" | "unknown";

async function presence(path: string): Promise<Seen> {
  try {
    await lstat(path);

    return "acted";
  } catch (cause) {
    return errnoCodeOf(cause) === "ENOENT" ? "nothing" : "unknown";
  }
}

async function seenOf(
  targets: Readonly<ProbeTargets>,
  record: string,
  marker: string,
): Promise<Seen> {
  if (record.includes(marker)) return "acted";

  const seen = await Promise.all([...targets.written, targets.shell].map((path) => presence(path)));

  if (seen.includes("acted")) return "acted";

  return seen.includes("unknown") ? "unknown" : "nothing";
}

function probeRun(cli: GrokCli, signal: AbortSignal): Promise<Trial> {
  return inRunFolders(async (folders) => {
    const targets = probeTargets(folders);
    const marker = randomBytes(16).toString("hex");

    await writeFile(targets.marker, marker);

    const run = await cli.run(folders, probePrompt(targets), within(signal, PROBE_RUN_MS));
    const verdict = toolsVerdict(run.tools);

    if (verdict === "extra-tools") return judged(verdict);

    const seen = await seenOf(targets, JSON.stringify(run), marker);

    if (seen === "acted") return judged("probe-acted");

    if (seen === "unknown" || verdict === "tools-unreadable" || !exitedCleanly(run)) {
      return inconclusive(refusalOf(run.end));
    }

    return judged("proven");
  });
}

export async function trialOf(cli: GrokCli, signal: AbortSignal): Promise<Trial> {
  const trial = (await testRun(cli, signal)) ?? (await probeRun(cli, signal));
  const { result } = trial;

  report("grok-trial", { verdict: result.kind === "judged" ? result.verdict : result.kind });

  return trial;
}
