import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  type Command,
  type CopyNames,
  type Inventory,
  type Stage,
  applyMigrations,
  cloudflare,
  copyNames,
  createDatabase,
  createQueue,
  databaseId,
  deleteDatabase,
  deleteQueue,
  deleteWorker,
  deployWorker,
  inventory,
  prOf,
  removeConsumer,
} from "./cloudflare.ts";
import { seedDemo } from "./demo.ts";
import {
  type MigrationHashes,
  MigrationHashesSchema,
  copyConfig,
  deleteConfig,
  migrationHashes,
  withStage,
} from "./stage.ts";

const MAX_COPIES = 20;

export const CopyRecordSchema = z
  .object({ databaseId: z.string().min(1), migrations: MigrationHashesSchema })
  .readonly();

export type CopyRecord = z.infer<typeof CopyRecordSchema>;

export interface DeployedCopy {
  readonly url: string;
  readonly record: CopyRecord;
}

type Step = readonly Command[];

const DeployOutputSchema = z.object({
  type: z.literal("deploy"),
  targets: z.array(z.string()).nonempty(),
});

function databaseIn(found: Readonly<Inventory>, names: Readonly<CopyNames>): string | undefined {
  return found.databases.find((database) => database.name === names.name)?.uuid;
}

function queueIn(found: Readonly<Inventory>, names: Readonly<CopyNames>) {
  return found.queues.find((queue) => queue.name === names.queue);
}

function refuseOverCapacity(found: Readonly<Inventory>, names: Readonly<CopyNames>): void {
  const resources = [
    ...found.workers,
    ...found.databases.map((database) => database.name),
    ...found.queues.map((queue) => queue.name),
  ];

  const open = [...new Set(resources.map((name) => prOf(name)))].toSorted((a, b) => a - b);

  if (!open.includes(prOf(names.name)) && open.length >= MAX_COPIES) {
    const list = open.map((pr) => copyNames(pr).name).join(", ");

    throw new Error(`${String(MAX_COPIES)} pull request copies exist already: ${list}`);
  }
}

function teardown(found: Readonly<Inventory>, names: Readonly<CopyNames>): Step[] {
  const queue = queueIn(found, names);

  const steps: Step[] = [
    queue?.consumers.includes(names.name) === true ? [removeConsumer(names.queue, names.name)] : [],
    found.workers.includes(names.name) ? [deleteWorker(names.name)] : [],
    [
      ...(queue === undefined ? [] : [deleteQueue(names.queue)]),
      ...(databaseIn(found, names) === undefined ? [] : [deleteDatabase(names.name)]),
    ],
  ];

  return steps.filter((step) => step.length > 0);
}

function withoutCopy(found: Readonly<Inventory>, names: Readonly<CopyNames>): Inventory {
  return {
    workers: found.workers.filter((worker) => worker !== names.name),
    databases: found.databases.filter((database) => database.name !== names.name),
    queues: found.queues.filter((queue) => queue.name !== names.queue),
  };
}

function messageOf(result: Readonly<PromiseSettledResult<void>>): string[] {
  if (result.status === "fulfilled") {
    return [];
  }

  return [result.reason instanceof Error ? result.reason.message : String(result.reason)];
}

async function runCommands(
  stage: Readonly<Stage>,
  steps: readonly Step[],
  options: Readonly<{ keepGoing: boolean }>,
): Promise<string[]> {
  const [step, ...rest] = steps;

  if (step === undefined) {
    return [];
  }

  const results = await Promise.allSettled(step.map((command) => cloudflare(stage, command)));
  const failures = results.flatMap((result) => messageOf(result));

  if (failures.length > 0 && !options.keepGoing) {
    throw new Error(failures.join("; "));
  }

  return [...failures, ...(await runCommands(stage, rest, options))];
}

function resetReason(
  found: Readonly<Inventory>,
  names: Readonly<CopyNames>,
  record: CopyRecord | null,
  hashes: MigrationHashes,
): string | null {
  const database = databaseIn(found, names);
  const hasQueue = queueIn(found, names) !== undefined;

  if (found.workers.includes(names.name) && (database === undefined || !hasQueue)) {
    return "lost a resource";
  }

  const recorded =
    record !== null &&
    record.databaseId === database &&
    Object.entries(record.migrations).every(([file, hash]) => hashes[file] === hash);

  return database === undefined || recorded
    ? null
    : "has a database whose migrations no record matches";
}

async function provision(
  stage: Readonly<Stage>,
  names: Readonly<CopyNames>,
  record: CopyRecord | null,
): Promise<CopyRecord> {
  const hashes = migrationHashes(stage.dir);
  let found = await inventory();
  refuseOverCapacity(found, names);

  const reason = resetReason(found, names, record, hashes);

  if (reason !== null) {
    process.stdout.write(`${names.name} ${reason}; deleting it to start again\n`);
    await runCommands(stage, teardown(found, names), { keepGoing: false });
    found = withoutCopy(found, names);
  }

  const existing = databaseIn(found, names);

  const creates = [
    ...(queueIn(found, names) === undefined ? [createQueue(names.queue)] : []),
    ...(existing === undefined ? [createDatabase(names.name)] : []),
  ];

  await runCommands(stage, [creates], { keepGoing: false });

  return { databaseId: existing ?? (await databaseId(names.name)), migrations: hashes };
}

async function publish(stage: Readonly<Stage>, setupCode: string): Promise<string> {
  const secretsFile = join(stage.dir, "secrets.json");
  const outputFile = join(stage.dir, "output.jsonl");
  writeFileSync(secretsFile, JSON.stringify({ SETUP_CODE: setupCode }), { mode: 0o600 });

  await cloudflare(stage, deployWorker(secretsFile, outputFile));

  const deploys = readFileSync(outputFile, "utf8")
    .split("\n")
    .flatMap((line) => {
      const entry = DeployOutputSchema.safeParse(line === "" ? null : JSON.parse(line));

      return entry.success ? [entry.data.targets[0]] : [];
    });

  const [url] = deploys;

  if (url === undefined) {
    throw new Error("wrangler deploy wrote no deploy target");
  }

  return url;
}

export function deployCopy(
  pr: number,
  artifact: string,
  record: CopyRecord | null,
): Promise<DeployedCopy> {
  const names = copyNames(pr);

  return withStage(copyConfig(names), artifact, async (stage) => {
    const next = await provision(stage, names, record);
    await cloudflare(stage, applyMigrations(names.name));

    const setupCode = randomBytes(24).toString("base64url");
    const url = await publish(stage, setupCode);
    await seedDemo(url, setupCode);

    return { url, record: next };
  });
}

export async function deleteCopy(pr: number): Promise<string[]> {
  const names = copyNames(pr);
  const found = await inventory();

  return withStage(deleteConfig(names), null, (stage) =>
    runCommands(stage, teardown(found, names), { keepGoing: true }),
  );
}
