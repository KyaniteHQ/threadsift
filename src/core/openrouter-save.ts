import { sql } from "drizzle-orm";

import {
  type PreparedSave,
  holdsSettings,
  prepareAiSettings,
  providerWrites,
  storedSettings,
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
): Promise<boolean> {
  try {
    return await guardedBatch(
      ports.db,
      sql`${sessionIsLive(ports.crypto, sessionId, DATABASE_NOW)} and ${CURRENT_REVISION} = ${claimed.expectedRevision} and ${DATABASE_NOW} < ${claimed.expiresAt}`,
      providerWrites(ports.db, prepared),
    );
  } catch (error) {
    logFailure("openrouter-connect-commit-failed", {}, error);

    return false;
  }
}

async function stillStored(
  ports: Ports,
  row: Readonly<PreparedSave["row"]>,
  writes: JobWrites,
): Promise<boolean> {
  try {
    return await guardedBatch(ports.db, storedSettings(row), writes);
  } catch (error) {
    logFailure("openrouter-connect-digests-failed", {}, error);

    return holdsSettings(ports.db, row);
  }
}

async function afterActivation(
  ports: Ports,
  { row }: Readonly<PreparedSave>,
  { key, extraWrites }: Readonly<{ key: string; extraWrites: () => JobWrites }>,
): Promise<ConnectNotice> {
  const active = await ports.ai.awaitOpenRouterActivation(key);

  if (!(await stillStored(ports, row, active ? extraWrites() : []))) return "settings-changed";

  return active ? "connected" : "activation-pending";
}

export async function saveConnectedKey(
  ports: Ports,
  { sessionId, claimed, key }: Readonly<{ sessionId: string; claimed: Claimed; key: string }>,
  extraWrites: () => JobWrites,
): Promise<ConnectNotice> {
  const prepared = await prepareOrNull(ports, { claimed, key });

  if (prepared === null || "kind" in prepared) return "possible-orphan";

  if (
    (await committed(ports, { sessionId, claimed, prepared })) ||
    (await holdsSettings(ports.db, prepared.row))
  ) {
    return afterActivation(ports, prepared, { key, extraWrites });
  }

  return "possible-orphan";
}
