import { sql } from "drizzle-orm";

import { expireAiTasks, lastDigestRefusedKey } from "./ai-task-rows.ts";
import type { Database } from "./database.ts";
import { owedDigests } from "./digest-opening.ts";
import { grokBotChosen, providerSet } from "./provider-saved.ts";

const OWED_DIGESTS_PER_SWEEP = 20;

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await db.batch(
    owedDigests(db, {
      provider: grokBotChosen(),
      limit: OWED_DIGESTS_PER_SWEEP,
      retried: sql`0`,
    }),
  );
}

export function requeuedDigests(db: Database) {
  return owedDigests(db, {
    provider: providerSet(),
    limit: undefined,
    retried: lastDigestRefusedKey(),
  });
}
