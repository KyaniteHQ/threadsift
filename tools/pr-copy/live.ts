import { randomBytes } from "node:crypto";

import {
  LIVE,
  cloudflare,
  createDatabase,
  createQueue,
  databaseId,
  inventory,
  workerSecretNames,
  type Inventory,
} from "./cloudflare.ts";
import { type CopyRecord, type DeployedCopy, publish } from "./copy.ts";
import { ensureDemo } from "./demo.ts";
import { checkMigrations, migrateAndRecord } from "./live-migrations.ts";
import { migrationHashes, withStage } from "./stage.ts";

function checkResources(found: Readonly<Inventory>, record: CopyRecord | null) {
  const database = found.databases.find((row) => row.name === LIVE.name);
  const queue = found.queues.find((row) => row.name === LIVE.queue);
  const workerExists = found.workers.includes(LIVE.name);

  if (record !== null && database?.uuid !== record.databaseId)
    throw new Error(
      `Live database id mismatch: ${LIVE.name}; restore the recorded database before deploying`,
    );

  if (workerExists && (database === undefined || queue === undefined))
    throw new Error(
      `Live Worker lost ${database === undefined ? `D1 database ${LIVE.name}` : `Queue ${LIVE.queue}`}; restore the missing resource before deploying`,
    );

  return { database, queue, workerExists };
}

export function deployLive(
  artifact: string,
  record: CopyRecord | null,
  beforeWrite: () => Promise<void>,
  saveRecord: (record: CopyRecord) => Promise<void>,
): Promise<DeployedCopy> {
  const hashes = migrationHashes(artifact);
  checkMigrations(record, hashes);

  return withStage(LIVE, artifact, async (stage) => {
    const found = await inventory(LIVE);
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
      workerExists ? await workerSecretNames(stage, LIVE.name) : [],
    );

    await ensureDemo(url, setupCode);

    return { url, record: { databaseId: id, migrations: hashes } };
  });
}
