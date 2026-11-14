import { and, eq, gt, lt, lte, sql } from "drizzle-orm";

import { aiTaskOwnersStep } from "./ai-task-owner-step.ts";
import { catalogKeySteps } from "./catalog-key-step.ts";
import type { DataStep } from "./data-step-contract.ts";
import { dataStepLease, dataSteps } from "./data-step-tables.ts";
import { logFailure } from "./failure-log.ts";
import { guardedBatch } from "./guards.ts";
import { ITEM_IDENTITY_VERSION, advanceItemIdentity } from "./item-identity.ts";
import { pause } from "./pause.ts";
import type { Database } from "./ports.ts";

const UNITS_PER_RUN = 100;

const LEASE_ROW = 1;

const LEASE_MS = 30_000;

const LEASE_WAIT_MS = 5_000;

const LEASE_POLL_MS = 100;

const STEPS: readonly DataStep[] = [
  { name: "item-identity", version: ITEM_IDENTITY_VERSION, advance: advanceItemIdentity },
  ...catalogKeySteps,
  aiTaskOwnersStep,
];

function cursorKey(version: number): string {
  return `${version}|`;
}

async function recordedRow(db: Database, name: string) {
  const [row] = await db.select().from(dataSteps).where(eq(dataSteps.name, name));

  return row ?? { name, version: 0, cursor: null };
}

function progress(db: Database, { name, version }: Readonly<DataStep>, cursor: string | null) {
  const stored = cursor === null ? null : `${cursorKey(version)}${cursor}`;

  return db
    .insert(dataSteps)
    .values({ name, version: cursor === null ? version : 0, cursor: stored })
    .onConflictDoUpdate({
      target: dataSteps.name,
      set: cursor === null ? { version, cursor: null } : { cursor: stored },
      setWhere: lt(dataSteps.version, version),
    });
}

async function claimLease(db: Database, holder: string): Promise<boolean> {
  const now = Date.now();

  const claimed = await db
    .insert(dataStepLease)
    .values({ id: LEASE_ROW, holder, expiresAt: now + LEASE_MS })
    .onConflictDoUpdate({
      target: dataStepLease.id,
      set: { holder, expiresAt: now + LEASE_MS },
      setWhere: lte(dataStepLease.expiresAt, now),
    })
    .returning({ id: dataStepLease.id });

  return claimed.length > 0;
}

function leaseHeld(holder: string) {
  return sql`exists (select 1 from ${dataStepLease} where ${dataStepLease.id} = ${LEASE_ROW} and ${dataStepLease.holder} = ${holder})`;
}

async function releaseLease(db: Database, holder: string): Promise<void> {
  await db
    .delete(dataStepLease)
    .where(and(eq(dataStepLease.id, LEASE_ROW), eq(dataStepLease.holder, holder)))
    .catch((error: Readonly<Error>) => {
      logFailure("data-step-lease-not-released", {}, error);
    });
}

async function runUnits(
  db: Database,
  step: Readonly<DataStep>,
  units: number,
  holder: string,
): Promise<number> {
  const row = await recordedRow(db, step.name);

  if (units === 0 || row.version >= step.version) {
    return units;
  }

  const prefix = cursorKey(step.version);
  const resume = row.cursor?.startsWith(prefix) === true ? row.cursor.slice(prefix.length) : null;
  const { writes, cursor, guard } = await step.advance(db, resume);

  const condition =
    guard === undefined ? leaseHeld(holder) : sql`${leaseHeld(holder)} and ${guard}`;

  const kept = await guardedBatch(db, condition, [
    ...writes,
    progress(db, step, cursor),
    db
      .update(dataStepLease)
      .set({ expiresAt: Date.now() + LEASE_MS })
      .where(and(eq(dataStepLease.id, LEASE_ROW), eq(dataStepLease.holder, holder))),
  ]);

  if (!kept) return 0;

  return cursor === null ? units - 1 : runUnits(db, step, units - 1, holder);
}

export async function migrateData(db: Database): Promise<void> {
  const holder = crypto.randomUUID();

  if (!(await claimLease(db, holder))) return;

  try {
    await STEPS.reduce(
      async (left, step) => runUnits(db, step, await left, holder),
      Promise.resolve(UNITS_PER_RUN),
    );
  } finally {
    await releaseLease(db, holder);
  }
}

async function pending(db: Database): Promise<boolean> {
  const rows = await db.select().from(dataSteps);
  const versions = new Map(rows.map(({ name, version }) => [name, version]));

  return STEPS.some(({ name, version }) => (versions.get(name) ?? 0) < version);
}

async function otherRunHolds(db: Database): Promise<boolean> {
  const [held] = await db
    .select({ id: dataStepLease.id })
    .from(dataStepLease)
    .where(and(eq(dataStepLease.id, LEASE_ROW), gt(dataStepLease.expiresAt, Date.now())));

  return held !== undefined;
}

async function settled(db: Database, deadline: number): Promise<boolean> {
  await migrateData(db).catch((error: Readonly<Error>) => {
    logFailure("data-steps-failed", {}, error);
  });

  if (!(await pending(db))) return true;

  if (Date.now() >= deadline || !(await otherRunHolds(db))) return false;

  await pause(LEASE_POLL_MS);

  return settled(db, deadline);
}

export async function dataStepsFinished(db: Database): Promise<boolean> {
  return !(await pending(db)) || settled(db, Date.now() + LEASE_WAIT_MS);
}
