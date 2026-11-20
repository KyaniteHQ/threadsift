import { sql } from "drizzle-orm";

import { sessionIsLive } from "../access/sessions.ts";
import type { ConnectNotice } from "../contract/openrouter-contract.ts";
import { CURRENT_REVISION } from "../kernel/ai-settings-revision.ts";
import { requeuedDigests } from "../kernel/digest-opening.ts";
import { logFailure } from "../kernel/failure-log.ts";
import { guardedBatch } from "../kernel/guards.ts";
import type { JobWrites } from "../kernel/job-outcome.ts";
import type { Ports } from "../kernel/ports.ts";
import { DATABASE_NOW } from "../kernel/sql-expressions.ts";
import {
  type PreparedSave,
  holdsSettings,
  prepareAiSettings,
  providerWrites,
  storedSettings,
} from "./ai-settings.ts";
import type { Claimed } from "./openrouter-claim.ts";
import { awaitOpenRouterActivation } from "./openrouter-exchange.ts";

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
  key: string,
): Promise<ConnectNotice> {
  const active = await awaitOpenRouterActivation(ports.ai, key);

  const requeued = active ? requeuedDigests(ports.db) : [];

  if (!(await stillStored(ports, row, requeued))) return "settings-changed";

  return active ? "connected" : "activation-pending";
}

export async function saveConnectedKey(
  ports: Ports,
  { sessionId, claimed, key }: Readonly<{ sessionId: string; claimed: Claimed; key: string }>,
): Promise<ConnectNotice> {
  const prepared = await prepareOrNull(ports, { claimed, key });

  if (prepared === null || "kind" in prepared) return "possible-orphan";

  if (
    (await committed(ports, { sessionId, claimed, prepared })) ||
    (await holdsSettings(ports.db, prepared.row))
  ) {
    return afterActivation(ports, prepared, key);
  }

  return "possible-orphan";
}
