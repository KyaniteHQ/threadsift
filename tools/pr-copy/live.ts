import { randomBytes } from "node:crypto";

import {
  appliedMigrations,
  applyMigrations,
  cloudflare,
  createDatabase,
  createQueue,
  databaseId,
  inventory,
  workerSecretNames,
  type Inventory,
  type Stage,
} from "./cloudflare.ts";
import { type CopyRecord, type DeployedCopy, publish } from "./copy.ts";
import { seedDemo } from "./demo.ts";
import { copyConfig, type MigrationHashes, migrationHashes, withStage } from "./stage.ts";

export const LIVE = { name: "threadsift-live", queue: "threadsift-live-jobs" } as const;

export function checkMigrations(record: CopyRecord | null, hashes: MigrationHashes): void {
  for (const [file, hash] of Object.entries(record?.migrations ?? {})) {
    if (hashes[file] !== hash)
      throw new Error(
        `Live migration mismatch: ${file}; restore its recorded SQL before deploying`,
      );
  }
}

function checkResources(found: Readonly<Inventory>, record: CopyRecord | null) {
  const database = found.databases.find((row) => row.name === LIVE.name);
  const queue = found.queues.find((row) => row.name === LIVE.queue);
  const workerExists = found.workers.includes(LIVE.name);

  if (record !== null && database?.uuid !== record.databaseId)
    throw new Error(
      "Live database id mismatch: threadsift-live; restore the recorded database before deploying",
    );

  if (workerExists && (database === undefined || queue === undefined))
    throw new Error(
      `Live Worker lost ${database === undefined ? "D1 database threadsift-live" : "Queue threadsift-live-jobs"}; restore the missing resource before deploying`,
    );

  return { database, queue, workerExists };
}

async function migrateAndRecord(
  stage: Readonly<Stage>,
  id: string,
  hashes: MigrationHashes,
  saveRecord: (record: CopyRecord) => Promise<void>,
): Promise<void> {
  try {
    await cloudflare(stage, applyMigrations(LIVE.name));
  } finally {
    const applied = await appliedMigrations(LIVE, id);

    const migrations = Object.fromEntries(
      applied.map((file) => {
        const hash = hashes[file];

        if (hash === undefined)
          throw new Error(`Live applied migration is absent from this build: ${file}`);

        return [file, hash];
      }),
    );

    await saveRecord({ databaseId: id, migrations });
  }
}

export function deployLive(
  artifact: string,
  record: CopyRecord | null,
  beforeWrite: () => Promise<void>,
  saveRecord: (record: CopyRecord) => Promise<void>,
): Promise<DeployedCopy> {
  const hashes = migrationHashes(artifact);
  checkMigrations(record, hashes);

  return withStage(LIVE, copyConfig(LIVE, artifact), artifact, async (stage) => {
    const found = await inventory("live");
    const { database, queue, workerExists } = checkResources(found, record);
    await beforeWrite();
    await Promise.all([
      ...(database === undefined ? [cloudflare(stage, createDatabase(LIVE.name))] : []),
      ...(queue === undefined ? [cloudflare(stage, createQueue(LIVE.queue))] : []),
    ]);
    const id = database?.uuid ?? (await databaseId(LIVE.name));

    await migrateAndRecord(stage, id, hashes, saveRecord);

    const setupCode = randomBytes(24).toString("base64url");

    const url = await publish(
      stage,
      setupCode,
      workerExists ? await workerSecretNames(LIVE.name) : [],
    );

    await seedDemo(url, setupCode, "live");

    return { url, record: { databaseId: id, migrations: hashes } };
  });
}
