import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { z } from "zod";

import { type CopyRecord, CopyRecordSchema, deleteCopy, deployCopy } from "./copy.ts";
import {
  closedPullRequest,
  deployedHead,
  lastRecord,
  markInactive,
  postDeployment,
  pullRequest,
  reopenedReason,
  staleReason,
} from "./github.ts";

const USAGE = `Usage:
  node tools/pr-copy/cli.ts deploy --artifact <dir> --github
  node tools/pr-copy/cli.ts deploy --artifact <dir> --pr <n> --record <file>
  node tools/pr-copy/cli.ts delete --github
  node tools/pr-copy/cli.ts delete --pr <n>`;

const PrSchema = z.coerce.number().int().positive();

const { positionals, values: flags } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    artifact: { type: "string" },
    github: { type: "boolean", default: false },
    pr: { type: "string" },
    record: { type: "string" },
  },
});

function required(value: string | undefined): string {
  if (value === undefined || positionals.length !== 1) {
    throw new Error(USAGE);
  }

  return value;
}

function localPr(): number {
  const pr = PrSchema.safeParse(required(flags.pr));

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

async function deployFromGithub(artifact: string): Promise<void> {
  const head = deployedHead();
  const stale = staleReason(head, await pullRequest(head.pr));

  if (stale !== null) {
    stopWithoutChanges(stale);

    return;
  }

  try {
    const copy = await deployCopy(head.pr, artifact, await lastRecord(head.pr));
    await postDeployment(head, copy);
    process.stdout.write(`Deployed ${copy.url}\n`);
  } catch (error) {
    await postDeployment(head, null);
    throw error;
  }
}

async function deployFromHere(artifact: string): Promise<void> {
  const record = required(flags.record);
  const copy = await deployCopy(localPr(), artifact, readRecord(record));
  writeFileSync(record, `${JSON.stringify(copy.record, null, 2)}\n`);
  process.stdout.write(`Deployed ${copy.url}; the record is in ${record}\n`);
}

async function deleteAndReport(pr: number): Promise<void> {
  const failures = await deleteCopy(pr);

  if (flags.github) {
    await markInactive(pr);
  }

  if (failures.length > 0) {
    throw new Error(
      `These deletions failed for pull request ${String(pr)}: ${failures.join("; ")}`,
    );
  }

  process.stdout.write(`Pull request ${String(pr)} has no copy left\n`);
}

async function deleteFromGithub(): Promise<void> {
  const pr = closedPullRequest();
  const reopened = reopenedReason(pr, await pullRequest(pr));

  if (reopened !== null) {
    stopWithoutChanges(reopened);

    return;
  }

  await deleteAndReport(pr);
}

function run(command: string | undefined): Promise<void> {
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
