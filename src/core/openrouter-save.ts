import { sql } from "drizzle-orm";

import { prepareAiSettings, upsertSettings } from "./ai-settings.ts";
import { logFailure } from "./failure-log.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Claimed } from "./openrouter-claim.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { Database, Ports } from "./ports.ts";
import { guardedBatch, settings } from "./schema.ts";
import { sessionIsLive } from "./sessions.ts";

async function holdsRow(
  db: Database,
  row: Readonly<Awaited<ReturnType<typeof prepareAiSettings>>>,
): Promise<boolean> {
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

export async function saveConnectedKey(
  ports: Ports,
  { sessionId, claimed, key }: Readonly<{ sessionId: string; claimed: Claimed; key: string }>,
  extraWrites: () => JobWrites,
): Promise<ConnectNotice> {
  const prepared = await prepareAiSettings(ports, {
    provider: "openrouter",
    model: claimed.model,
    key,
  });

  if ("kind" in prepared) return "possible-orphan";

  try {
    const committed = await guardedBatch(
      ports.db,
      sql`${sessionIsLive(ports.crypto, sessionId)} and ${CURRENT_REVISION} = ${claimed.expectedRevision} and ${Date.now()} < ${claimed.expiresAt}`,
      [upsertSettings(ports.db, prepared), ...extraWrites()],
    );

    return committed ? "connected" : "possible-orphan";
  } catch (error) {
    logFailure("openrouter-connect-commit-failed", {}, error);

    return (await holdsRow(ports.db, prepared)) ? "connected" : "possible-orphan";
  }
}
