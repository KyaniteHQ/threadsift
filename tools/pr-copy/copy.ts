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
  copyNumbers,
  createDatabase,
  createQueue,
  databaseId,
  deleteBucket,
  deleteDatabase,
  deleteQueue,
  deleteWorker,
  deployWorker,
  inventory,
  workerSecretNames,
  prOf,
  removeConsumer,
} from "./cloudflare.ts";
import { type AccessCodes, newAccessCodes } from "./codes.ts";
import { seedDemo } from "./demo.ts";
import {
  type MigrationHashes,
  MigrationHashesSchema,
  migrationHashes,
  withStage,
} from "./stage.ts";

const MAX_COPIES = 20;

export const CopyRecordSchema = z
  .object({
    databaseId: z.string().min(1),
    migrations: MigrationHashesSchema,
  })
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
  const open = copyNumbers(found);

  if (!open.includes(prOf(names.name)) && open.length >= MAX_COPIES) {
    const list = open.map((pr) => copyNames(pr).name).join(", ");

    throw new Error(`${String(MAX_COPIES)} pull request copies exist already: ${list}`);
  }
}

interface Teardown {
  readonly consumer: Step;
  readonly worker: Step;
  readonly others: Step;
  readonly bucket: Step;
}

function teardown(found: Readonly<Inventory>, names: Readonly<CopyNames>): Teardown {
  const queue = queueIn(found, names);

  return {
    consumer:
      queue?.consumers.includes(names.name) === true
        ? [removeConsumer(names.queue, names.name)]
        : [],
    worker: found.workers.includes(names.name) ? [deleteWorker(names.name)] : [],
    others: [
      ...(queue === undefined ? [] : [deleteQueue(names.queue)]),
      ...(databaseIn(found, names) === undefined ? [] : [deleteDatabase(names.name)]),
    ],
    bucket: found.buckets.includes(names.bucket) ? [deleteBucket(names.bucket)] : [],
  };
}

function withoutCopy(found: Readonly<Inventory>, names: Readonly<CopyNames>): Inventory {
  return {
    workers: found.workers.filter((worker) => worker !== names.name),
    databases: found.databases.filter((database) => database.name !== names.name),
    queues: found.queues.filter((queue) => queue.name !== names.queue),
    buckets: found.buckets.filter((bucket) => bucket !== names.bucket),
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

async function runTeardown(
  stage: Readonly<Stage>,
  found: Readonly<Inventory>,
  names: Readonly<CopyNames>,
  options: Readonly<{ keepGoing: boolean }>,
): Promise<string[]> {
  const plan = teardown(found, names);
  const consumer = await runCommands(stage, [plan.consumer], options);
  const worker = await runCommands(stage, [plan.worker], options);
  const workerGone = worker.length === 0;

  if (!workerGone && plan.bucket.length > 0) {
    process.stdout.write(`Kept the bucket ${names.bucket}: its Worker is not confirmed gone\n`);
  }

  const rest = await runCommands(
    stage,
    [[...plan.others, ...(workerGone ? plan.bucket : [])]],
    options,
  );

  return [...consumer, ...worker, ...rest];
}

function resetReason(
  found: Readonly<Inventory>,
  names: Readonly<CopyNames>,
  record: CopyRecord | null,
  hashes: MigrationHashes,
): string | null {
  const database = databaseIn(found, names);
  const hasQueue = queueIn(found, names) !== undefined;
  const hasBucket = found.buckets.includes(names.bucket);
  const hasWorker = found.workers.includes(names.name);

  if (!hasWorker && (database !== undefined || hasQueue || hasBucket)) {
    return "has resources but no Worker";
  }

  if (hasWorker && (database === undefined || !hasQueue)) {
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
) {
  const hashes = migrationHashes(stage.dir);
  let found = await inventory();
  refuseOverCapacity(found, names);

  const reason = resetReason(found, names, record, hashes);

  if (reason !== null) {
    process.stdout.write(`${names.name} ${reason}; deleting it to start again\n`);
    await runTeardown(stage, found, names, { keepGoing: false });
    found = withoutCopy(found, names);
  }

  const existing = databaseIn(found, names);

  const creates = [
    ...(queueIn(found, names) === undefined ? [createQueue(names.queue)] : []),
    ...(existing === undefined ? [createDatabase(names.name)] : []),
  ];

  await runCommands(stage, [creates], { keepGoing: false });

  return {
    record: { databaseId: existing ?? (await databaseId(names.name)), migrations: hashes },
    secrets: found.workers.includes(names.name) ? await workerSecretNames(stage, names.name) : [],
  };
}

interface CopySecrets {
  SETUP_CODE: string;
  PASSWORD_RESET_CODE: string;
  THREADSIFT_SECRET_KEY?: string;
}

export async function publish(
  stage: Readonly<Stage>,
  codes: Readonly<AccessCodes>,
  secretNames: readonly string[],
): Promise<string> {
  const secretsFile = join(stage.dir, "secrets.json");
  const outputFile = join(stage.dir, "output.jsonl");
  const secrets: CopySecrets = { SETUP_CODE: codes.setup, PASSWORD_RESET_CODE: codes.reset };

  if (!secretNames.includes("THREADSIFT_SECRET_KEY")) {
    secrets.THREADSIFT_SECRET_KEY = randomBytes(32).toString("hex");
  }

  writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });

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

  if (stage.origin !== null && new URL(url).origin !== stage.origin) {
    throw new Error("wrangler deployed to an address other than THREADSIFT_PUBLIC_ORIGIN");
  }

  return url;
}

export function deployCopy(
  pr: number,
  artifact: string,
  record: CopyRecord | null,
): Promise<DeployedCopy> {
  const names = copyNames(pr);

  return withStage(names, artifact, async (stage) => {
    const next = await provision(stage, names, record);
    await cloudflare(stage, applyMigrations(names.name));

    const codes = newAccessCodes();
    const url = await publish(stage, codes, next.secrets);
    await seedDemo(url, codes);

    return { url, record: next.record };
  });
}

export async function deleteCopy(pr: number): Promise<string[]> {
  const names = copyNames(pr);
  const found = await inventory();

  return withStage(names, null, (stage) => runTeardown(stage, found, names, { keepGoing: true }));
}
