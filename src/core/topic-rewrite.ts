import { and, eq, sql } from "drizzle-orm";

import { TOPIC_KIND } from "./catalog-key-links.ts";
import { dataStepRenames } from "./data-step-tables.ts";
import type { Database } from "./ports.ts";
import { catalogVersion, topics } from "./schema.ts";
import { continuingOverview } from "./topic-overview-open.ts";

export function topicClosingWrites(db: Database, loser: number, survivor: number) {
  const gone = TOPIC_KIND.unlinked(db, loser);

  return [
    db.insert(catalogVersion).values({ id: 1, version: 0 }).onConflictDoNothing(),
    db
      .update(catalogVersion)
      .set({ version: sql`${catalogVersion.version} + 1` })
      .where(and(eq(catalogVersion.id, 1), gone)),
    db
      .delete(dataStepRenames)
      .where(
        and(eq(dataStepRenames.step, TOPIC_KIND.step), eq(dataStepRenames.subject, loser), gone),
      ),
    continuingOverview(db, survivor, gone),
    db.delete(topics).where(and(eq(topics.id, loser), gone)),
  ];
}
