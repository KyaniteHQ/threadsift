import { sql } from "drizzle-orm";

import { type PreparedSettings, prepareAiSettings, upsertSettings } from "./ai-settings.ts";
import { logFailure } from "./failure-log.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Claimed } from "./openrouter-claim.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { Database, Ports } from "./ports.ts";
import { DATABASE_NOW, guardedBatch, settings } from "./schema.ts";
import { sessionIsLive } from "./sessions.ts";

async function holdsRow(db: Database, row: Readonly<PreparedSettings>): Promise<boolean> {
  try {
    const [stored] = await db.select().from(settings);

    return (
      stored !== undefined &&
      "sealedKey" in row &&
      stored.sealedKey === row.sealedKey &&
      stored.provider === row.provider &&
      stored.model === row.model
    );
  } catch {
    return false;
  }
}

type Prepared = Awaited<ReturnType<typeof prepareAiSettings>>;

async function prepareOrNull(
  ports: Ports,
  { claimed, key }: Readonly<{ claimed: Claimed; key: string }>,
): Promise<Prepared | null> {
  try {
    return await prepareAiSettings(ports, { provider: "openrouter", model: claimed.model, key });
  } catch (error) {
    logFailure("openrouter-connect-prepare-failed", {}, error);

    return null;
  }
}

async function committed(
  ports: Ports,
  {
    sessionId,
    claimed,
    row,
  }: Readonly<{ sessionId: string; claimed: Claimed; row: Readonly<PreparedSettings> }>,
  extraWrites: () => JobWrites,
): Promise<boolean> {
  try {
    return await guardedBatch(
      ports.db,
      sql`${sessionIsLive(ports.crypto, sessionId, DATABASE_NOW)} and ${CURRENT_REVISION} = ${claimed.expectedRevision} and ${DATABASE_NOW} < ${claimed.expiresAt}`,
      [upsertSettings(ports.db, row), ...extraWrites()],
    );
  } catch (error) {
    logFailure("openrouter-connect-commit-failed", {}, error);

    return false;
  }
}

export async function saveConnectedKey(
  ports: Ports,
  { sessionId, claimed, key }: Readonly<{ sessionId: string; claimed: Claimed; key: string }>,
  extraWrites: () => JobWrites,
): Promise<ConnectNotice> {
  const prepared = await prepareOrNull(ports, { claimed, key });

  if (prepared === null || "kind" in prepared) return "possible-orphan";

  const { row } = prepared;

  if (await committed(ports, { sessionId, claimed, row }, extraWrites)) return "connected";

  return (await holdsRow(ports.db, row)) ? "connected" : "possible-orphan";
}
