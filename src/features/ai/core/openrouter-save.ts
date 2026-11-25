import { sql } from "drizzle-orm";

import { SETTINGS_CHANGED } from "../../../core/contract/ai-contract.ts";
import type { ConnectNotice } from "../../../core/contract/openrouter-contract.ts";
import { CURRENT_REVISION } from "../../../core/kernel/ai-settings-revision.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { DATABASE_NOW } from "../../../core/kernel/sql-expressions.ts";
import { sessionIsLive } from "../../access/core/sessions.ts";
import { type PreparedSave, prepareAiSettings, providerWrites } from "./ai-settings.ts";
import type { Claimed } from "./openrouter-claim.ts";
import { awaitOpenRouterActivation } from "./openrouter-exchange.ts";
import { holdsSettings, reopenedWhileStored } from "./openrouter-stored.ts";

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

async function afterActivation(
  ports: Ports,
  { row }: Readonly<PreparedSave>,
  key: string,
): Promise<ConnectNotice> {
  const active = await awaitOpenRouterActivation(ports.ai, key);

  const stored = active
    ? await reopenedWhileStored(ports, row)
    : await holdsSettings(ports.db, row);

  if (!stored) return SETTINGS_CHANGED;

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
