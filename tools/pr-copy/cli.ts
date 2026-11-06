import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { type CopyRecord, CopyRecordSchema, deleteCopy, deployCopy } from "./copy.ts";
import {
  ArtifactMetaSchema,
  closedPullRequest,
  eventReason,
  lastRecord,
  markInactive,
  postDeployment,
  reopenedReason,
  staleReason,
} from "./github.ts";

const USAGE = `Usage:
  node tools/pr-copy/cli.ts deploy --artifact <dir> --github
  node tools/pr-copy/cli.ts deploy --artifact <dir> --pr <n> --record <file>
  node tools/pr-copy/cli.ts delete --github
  node tools/pr-copy/cli.ts delete --pr <n>`;

const ArgsSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("deploy-github"), artifact: z.string() }),
  z.strictObject({
    mode: z.literal("deploy-local"),
    artifact: z.string(),
    pr: z.coerce.number().int().positive(),
    record: z.string(),
  }),
  z.strictObject({ mode: z.literal("delete-github") }),
  z.strictObject({ mode: z.literal("delete-local"), pr: z.coerce.number().int().positive() }),
]);

type Args = z.infer<typeof ArgsSchema>;

function parseCommand(argv: readonly string[]): Args {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      artifact: { type: "string" },
      github: { type: "boolean", default: false },
      pr: { type: "string" },
      record: { type: "string" },
    },
  });

  const { github, ...flags } = values;

  const parsed = ArgsSchema.safeParse({
    ...flags,
    mode: `${positionals.join(" ")}-${github ? "github" : "local"}`,
  });

  if (!parsed.success || positionals.length !== 1) {
    throw new Error(USAGE);
  }

  return parsed.data;
}

function readRecord(path: string): CopyRecord | null {
  return existsSync(path) ? CopyRecordSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
}

function stopWithoutChanges(reason: string): void {
  process.stdout.write(`No changes: ${reason}\n`);
}

async function deployFromGithub(artifact: string): Promise<void> {
  const metaFile = join(artifact, "dist", "pr-copy.json");
  const meta = ArtifactMetaSchema.parse(JSON.parse(readFileSync(metaFile, "utf8")));
  const stale = eventReason(meta) ?? (await staleReason(meta));

  if (stale !== null) {
    stopWithoutChanges(stale);

    return;
  }

  try {
    const copy = await deployCopy(meta.pr, artifact, await lastRecord(meta.pr));
    await postDeployment(meta, { kind: "success", copy });
    process.stdout.write(`Deployed ${copy.url}\n`);
  } catch (error) {
    await postDeployment(meta, { kind: "failure" });
    throw error;
  }
}

async function deployFromHere(args: Readonly<Extract<Args, { mode: "deploy-local" }>>) {
  const copy = await deployCopy(args.pr, args.artifact, readRecord(args.record));
  writeFileSync(args.record, `${JSON.stringify(copy.record, null, 2)}\n`);
  process.stdout.write(`Deployed ${copy.url}; the record is in ${args.record}\n`);
}

function reportDeletions(pr: number, failures: readonly string[]): void {
  if (failures.length > 0) {
    throw new Error(
      `These deletions failed for pull request ${String(pr)}: ${failures.join("; ")}`,
    );
  }

  process.stdout.write(`Pull request ${String(pr)} has no copy left\n`);
}

async function deleteFromGithub(): Promise<void> {
  const pr = closedPullRequest();
  const stale = await reopenedReason(pr);

  if (stale !== null) {
    stopWithoutChanges(stale);

    return;
  }

  const failures = await deleteCopy(pr);
  await markInactive(pr);
  reportDeletions(pr, failures);
}

async function run(args: Readonly<Args>): Promise<void> {
  switch (args.mode) {
    case "deploy-github":
      return deployFromGithub(args.artifact);
    case "deploy-local":
      return deployFromHere(args);
    case "delete-github":
      return deleteFromGithub();
    case "delete-local": {
      reportDeletions(args.pr, await deleteCopy(args.pr));

      return;
    }

    default: {
      const exhaustive: never = args;

      return exhaustive;
    }
  }
}

try {
  await run(parseCommand(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
