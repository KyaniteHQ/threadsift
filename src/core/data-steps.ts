import type { BatchItem } from "drizzle-orm/batch";

import { dataSteps } from "./data-step-tables.ts";
import { ITEM_IDENTITY_VERSION, planItemIdentity } from "./item-identity.ts";
import type { Database } from "./ports.ts";

interface DataStep {
  readonly name: string;
  readonly version: number;
  readonly plan: (db: Database) => Promise<readonly (readonly BatchItem<"sqlite">[])[]>;
}

const STEPS: readonly DataStep[] = [
  { name: "item-identity", version: ITEM_IDENTITY_VERSION, plan: planItemIdentity },
];

async function recordedVersions(db: Database): Promise<ReadonlyMap<string, number>> {
  const rows = await db.select().from(dataSteps);

  return new Map(rows.map(({ name, version }) => [name, version]));
}

async function commit(db: Database, [first, ...rest]: readonly BatchItem<"sqlite">[]) {
  if (first !== undefined) {
    await db.batch([first, ...rest]);
  }
}

async function runStep(db: Database, { name, version, plan }: Readonly<DataStep>): Promise<void> {
  const batches = await plan(db);

  const recorded = db
    .insert(dataSteps)
    .values({ name, version })
    .onConflictDoUpdate({ target: dataSteps.name, set: { version } });

  await batches
    .slice(0, -1)
    .reduce((done, writes) => done.then(() => commit(db, writes)), Promise.resolve());

  await db.batch([recorded, ...(batches.at(-1) ?? [])]);
}

export async function migrateData(db: Database): Promise<void> {
  const recorded = await recordedVersions(db);

  await STEPS.filter(({ name, version }) => (recorded.get(name) ?? 0) < version).reduce(
    (done, step) => done.then(() => runStep(db, step)),
    Promise.resolve(),
  );
}
