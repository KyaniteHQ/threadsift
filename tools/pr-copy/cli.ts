import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  type CopyRecord,
  CopyRecordSchema,
  type DeployedCopy,
  deleteCopy,
  deployCopy,
} from "./copy.ts";
import {
  closedPullRequest,
  deployedHead,
  lastRecord,
  markInactive,
  type PullHead,
  postDeployment,
  pullRequest,
  reopenedReason,
  staleReason,
  liveHead,
  requireMainHead,
  lastLiveRecord,
  recordLive,
  finishDeployment,
  CoercedPrNumber,
} from "./github.ts";
import { deployLive } from "./live.ts";
import { sweep } from "./sweep.ts";

const USAGE = `Usage:
  node tools/pr-copy/cli.ts deploy --artifact <dir> --github
  node tools/pr-copy/cli.ts deploy --artifact <dir> --pr <n> --record <file>
  node tools/pr-copy/cli.ts delete --github
  node tools/pr-copy/cli.ts delete --pr <n>
  node tools/pr-copy/cli.ts live --artifact <dir> --github
  node tools/pr-copy/cli.ts sweep [--dry-run]`;

const { positionals, values: flags } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    artifact: { type: "string" },
    github: { type: "boolean", default: false },
    pr: { type: "string" },
    record: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

function required(value: string | undefined): string {
  if (value === undefined || positionals.length !== 1) {
    throw new Error(USAGE);
  }

  return value;
}

function localPr(): number {
  const pr = CoercedPrNumber.safeParse(required(flags.pr));

  if (!pr.success) {
    throw new Error(USAGE);
  }

  return pr.data;
}

function readRecord(path: string): CopyRecord | null {
  return existsSync(path) ? CopyRecordSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
}

function stopWithoutChanges(reason: string): void {
  process.stdout.write(`No changes: ${reason}\n`);
}

async function postFailure(head: Readonly<PullHead>): Promise<void> {
  try {
    await postDeployment(head, null);
  } catch (error) {
    process.stderr.write(`Posting the failed deployment failed too: ${String(error)}\n`);
  }
}

async function deployFromGithub(artifact: string): Promise<void> {
  const head = deployedHead();
  const stale = staleReason(head, await pullRequest(head.pr));

  if (stale !== null) {
    stopWithoutChanges(stale);

    return;
  }

  let copy: DeployedCopy;

  try {
    copy = await deployCopy(head.pr, artifact, await lastRecord(head.pr));
  } catch (error) {
    await postFailure(head);
    throw error;
  }

  await postDeployment(head, copy);
  process.stdout.write(`Deployed ${copy.url}\n`);
}

async function deployFromHere(artifact: string): Promise<void> {
  const record = required(flags.record);
  const copy = await deployCopy(localPr(), artifact, readRecord(record));
  writeFileSync(record, `${JSON.stringify(copy.record, null, 2)}\n`);
  process.stdout.write(`Deployed ${copy.url}; the record is in ${record}\n`);
}

async function deleteAndReport(pr: number): Promise<void> {
  const failures = await deleteCopy(pr);

  if (failures.length > 0) {
    throw new Error(
      `These deletions failed for pull request ${String(pr)}: ${failures.join("; ")}`,
    );
  }

  if (flags.github) await markInactive(pr);

  process.stdout.write(`Pull request ${String(pr)} has no copy left\n`);
}

async function deleteFromGithub(): Promise<void> {
  const pr = flags.pr === undefined ? closedPullRequest() : localPr();
  const reopened = reopenedReason(pr, await pullRequest(pr));

  if (reopened !== null) {
    if (flags.pr !== undefined) throw new Error(reopened);
    stopWithoutChanges(reopened);

    return;
  }

  await deleteAndReport(pr);
}

async function liveFromGithub(artifact: string): Promise<void> {
  const sha = liveHead();
  let deployment: number | undefined;

  try {
    const copy = await deployLive(
      artifact,
      await lastLiveRecord(),
      () => requireMainHead(sha),
      async (record) => {
        deployment = await recordLive(sha, record);
      },
    );

    if (deployment === undefined) throw new Error("Live migration record was not saved");
    await finishDeployment(deployment, copy.url);
    process.stdout.write(`Deployed ${copy.url}\n`);
  } catch (error) {
    if (deployment !== undefined) await finishDeployment(deployment, null);
    throw error;
  }
}

function run(command: string | undefined): Promise<void> {
  if (command === "sweep" && positionals.length === 1) return sweep(flags["dry-run"]);

  if (command === "live" && flags.github) return liveFromGithub(required(flags.artifact));

  if (command === "deploy") {
    const artifact = required(flags.artifact);

    return flags.github ? deployFromGithub(artifact) : deployFromHere(artifact);
  }

  if (command === "delete") {
    return flags.github ? deleteFromGithub() : deleteAndReport(localPr());
  }

  throw new Error(USAGE);
}

try {
  await run(positionals[0]);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
