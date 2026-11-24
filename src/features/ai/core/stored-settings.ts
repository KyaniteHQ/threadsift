import { type SQL, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { logFailure, readOrAssume } from "../../../core/kernel/failure-log.ts";
import { guardHolds } from "../../../core/kernel/guards.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { grokBotChosen } from "../../../core/kernel/provider-saved.ts";
import { settings } from "../../../core/kernel/schema.ts";
import { type PreparedSave, saveWithDigests } from "./ai-settings.ts";

type PreparedRow = Readonly<PreparedSave["row"]>;

function storedRow(row: PreparedRow): SQL {
  return sql`(exists (select 1 from ${settings} where ${settings.id} = ${row.id} and ${settings.sealedKey} = ${row.sealedKey} and ${settings.provider} = ${row.provider} and ${settings.model} = ${row.model}) and not ${grokBotChosen()})`;
}

export function holdsSettings(db: Database, row: PreparedRow): Promise<boolean> {
  return readOrAssume(false, { event: "stored-settings-read-failed", fields: {} }, () =>
    guardHolds(db, storedRow(row)),
  );
}

export async function reopenedWhileStored(
  ports: Pick<Ports, "db" | "jobs">,
  row: PreparedRow,
): Promise<boolean> {
  try {
    return await saveWithDigests(ports, storedRow(row), []);
  } catch (error) {
    logFailure("openrouter-connect-digests-failed", {}, error);

    return holdsSettings(ports.db, row);
  }
}
