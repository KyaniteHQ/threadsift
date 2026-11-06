import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  type CopyCommand,
  type CopyNames,
  type Inventory,
  type Stage,
  copyNames,
  inventory,
  cloudflare,
  workersSubdomain,
} from "./cloudflare.ts";
import { seedDemo } from "./demo.ts";
import {
  type MigrationHashes,
  copyConfig,
  emptyStage,
  migrationHashes,
  stageArtifact,
} from "./stage.ts";

const MAX_COPIES = 20;

export const CopyRecordSchema = z.object({
  databaseId: z.string().min(1),
  migrations: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u)),
});

export type CopyRecord = Readonly<{ databaseId: string; migrations: MigrationHashes }>;

export interface DeployedCopy {
  readonly url: string;
  readonly record: CopyRecord;
}

interface Plan {
  readonly pr: number;
  readonly names: CopyNames;
  readonly record: CopyRecord | null;
  readonly hashes: MigrationHashes;
}

function databaseIn(found: Readonly<Inventory>, names: Readonly<CopyNames>): string | undefined {
  return found.databases.find((database) => database.name === names.database)?.uuid;
}

function queueIn(found: Readonly<Inventory>, names: Readonly<CopyNames>) {
  return found.queues.find((queue) => queue.name === names.queue);
}

function keepsRecordedMigrations(plan: Readonly<Plan>, databaseId: string): boolean {
  if (plan.record === null || plan.record.databaseId !== databaseId) {
    return false;
  }

  return Object.entries(plan.record.migrations).every(([file, hash]) => plan.hashes[file] === hash);
}

function refuseOverCapacity(found: Readonly<Inventory>, pr: number): void {
  if (!found.prs.includes(pr) && found.prs.length >= MAX_COPIES) {
    const open = found.prs.map((number) => `threadsift-pr-${String(number)}`).join(", ");

    throw new Error(`${String(MAX_COPIES)} pull request copies exist already: ${open}`);
  }
}

function presentCommands(found: Readonly<Inventory>, names: Readonly<CopyNames>): CopyCommand[] {
  const hasWorker = found.workers.includes(names.worker);
  const queue = queueIn(found, names);

  return [
    ...(queue?.consumers.includes(names.worker) === true
      ? [{ kind: "remove-consumer", queue: names.queue, worker: names.worker } as const]
      : []),
    ...(hasWorker ? [{ kind: "delete-worker", worker: names.worker } as const] : []),
    ...(queue === undefined ? [] : [{ kind: "delete-queue", queue: names.queue } as const]),
    ...(databaseIn(found, names) === undefined
      ? []
      : [{ kind: "delete-database", database: names.database } as const]),
  ];
}

function resetReason(found: Readonly<Inventory>, plan: Readonly<Plan>): string | null {
  const { names } = plan;
  const database = databaseIn(found, names);
  const hasQueue = queueIn(found, names) !== undefined;

  if (found.workers.includes(names.worker) && (database === undefined || !hasQueue)) {
    return "lost a resource";
  }

  if (database !== undefined && !keepsRecordedMigrations(plan, database)) {
    return "has a database whose migrations no record matches";
  }

  return null;
}

async function currentInventory(stage: Readonly<Stage>, plan: Readonly<Plan>): Promise<Inventory> {
  const found = await inventory();
  refuseOverCapacity(found, plan.pr);

  const reason = resetReason(found, plan);

  if (reason === null) {
    return found;
  }

  process.stdout.write(`${plan.names.worker} ${reason}; deleting it to start again\n`);

  await runInOrder(stage, presentCommands(found, plan.names));

  return inventory();
}

async function provision(stage: Readonly<Stage>, plan: Readonly<Plan>): Promise<string> {
  const found = await currentInventory(stage, plan);
  const { names } = plan;

  if (queueIn(found, names) === undefined) {
    await cloudflare(stage, { kind: "create-queue", queue: names.queue });
  }

  const existing = databaseIn(found, names);

  if (existing !== undefined) {
    return existing;
  }

  await cloudflare(stage, { kind: "create-database", database: names.database });

  const created = databaseIn(await inventory(), names);

  if (created === undefined) {
    throw new Error(`${names.database} is missing right after wrangler d1 create`);
  }

  return created;
}

function writeSecrets(dir: string, setupCode: string): string {
  const path = join(dir, "secrets.json");
  writeFileSync(path, JSON.stringify({ SETUP_CODE: setupCode }), { mode: 0o600 });

  return path;
}

async function publish(stage: Readonly<Stage>, setupCode: string): Promise<void> {
  const secretsFile = writeSecrets(stage.dir, setupCode);

  try {
    await cloudflare(stage, { kind: "deploy", secretsFile });
  } finally {
    rmSync(secretsFile, { force: true });
  }
}

export async function deployCopy(
  pr: number,
  artifact: string,
  record: CopyRecord | null,
): Promise<DeployedCopy> {
  const names = copyNames(pr);
  const dir = stageArtifact(artifact);

  try {
    const plan = { pr, names, record, hashes: migrationHashes(dir) };
    const databaseId = await provision({ dir, config: copyConfig(names) }, plan);
    const stage = { dir, config: copyConfig(names, databaseId) };

    await cloudflare(stage, { kind: "apply-migrations", database: names.database });

    const setupCode = randomBytes(24).toString("base64url");
    await publish(stage, setupCode);

    const url = `https://${names.worker}.${await workersSubdomain()}.workers.dev`;
    await seedDemo(url, setupCode);

    return { url, record: { databaseId, migrations: plan.hashes } };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runInOrder(
  stage: Readonly<Stage>,
  commands: readonly Readonly<CopyCommand>[],
): Promise<void> {
  const [first, ...rest] = commands;

  if (first !== undefined) {
    await cloudflare(stage, first);
    await runInOrder(stage, rest);
  }
}

async function attemptEach(
  stage: Readonly<Stage>,
  commands: readonly Readonly<CopyCommand>[],
): Promise<string[]> {
  const [first, ...rest] = commands;

  if (first === undefined) {
    return [];
  }

  const failures: string[] = [];

  try {
    await cloudflare(stage, first);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  return [...failures, ...(await attemptEach(stage, rest))];
}

export async function deleteCopy(pr: number): Promise<string[]> {
  const names = copyNames(pr);
  const found = await inventory();
  const dir = emptyStage();

  try {
    return await attemptEach({ dir, config: copyConfig(names) }, presentCommands(found, names));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
