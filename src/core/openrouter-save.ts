import { sql } from "drizzle-orm";

import {
  type PreparedSave,
  holdsSettings,
  prepareAiSettings,
  providerWrites,
} from "./ai-settings.ts";
import { logFailure } from "./failure-log.ts";
import { DATABASE_NOW, guardedBatch } from "./guards.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Claimed } from "./openrouter-claim.ts";
import type { ConnectNotice } from "./openrouter-contract.ts";
import { CURRENT_REVISION } from "./openrouter-tables.ts";
import type { Ports } from "./ports.ts";
import { sessionIsLive } from "./sessions.ts";

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
    prepared,
  }: Readonly<{
    sessionId: string;
    claimed: Claimed;
    prepared: Readonly<PreparedSave>;
  }>,
  extraWrites: () => JobWrites,
): Promise<boolean> {
  try {
    return await guardedBatch(
      ports.db,
      sql`${sessionIsLive(ports.crypto, sessionId, DATABASE_NOW)} and ${CURRENT_REVISION} = ${claimed.expectedRevision} and ${DATABASE_NOW} < ${claimed.expiresAt}`,
      [...providerWrites(ports.db, prepared), ...extraWrites()],
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

  if (await committed(ports, { sessionId, claimed, prepared }, extraWrites)) return "connected";

  return (await holdsSettings(ports.db, prepared.row)) ? "connected" : "possible-orphan";
}
