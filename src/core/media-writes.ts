import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { MediaRowValue } from "./article-images.ts";
import type { MediaKind, MediaOutcome } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { media } from "./schema.ts";

const FIELD = (name: string) => sql.raw(`json_extract(value, '$.${name}')`);

export async function mediaKeysOf(db: Database, itemId: number): Promise<readonly string[]> {
  const rows = await db
    .select({ key: media.fileKey })
    .from(media)
    .where(and(eq(media.itemId, itemId), isNotNull(media.fileKey)));

  return rows.flatMap(({ key }) => (key === null ? [] : [key]));
}

export function mediaWrites(
  db: Database,
  itemId: number,
  rows: readonly MediaRowValue[],
): readonly BatchItem<"sqlite">[] {
  const json = JSON.stringify(rows);

  const kept = sql`exists (select 1 from json_each(${json}) where ${FIELD("kind")} = ${media.kind} and ${FIELD("sourceUrl")} = ${media.sourceUrl})`;

  return [
    db.delete(media).where(and(eq(media.itemId, itemId), sql`not ${kept}`)),
    db
      .insert(media)
      .select(
        db
          .select({
            id: sql<null>`null`.as("id"),
            itemId: sql<number>`${itemId}`.as("item_id"),
            kind: sql<MediaKind>`${FIELD("kind")}`.as("kind"),
            sourceUrl: sql<string>`${FIELD("sourceUrl")}`.as("source_url"),
            finalUrl: sql<string | null>`${FIELD("finalUrl")}`.as("final_url"),
            position: sql<number>`${FIELD("position")}`.as("position"),
            outcome: sql<MediaOutcome>`${FIELD("outcome")}`.as("outcome"),
            reason: sql<string | null>`${FIELD("reason")}`.as("reason"),
            fileKey: sql<string | null>`${FIELD("fileKey")}`.as("file_key"),
            contentType: sql<string | null>`${FIELD("contentType")}`.as("content_type"),
            size: sql<number | null>`${FIELD("size")}`.as("size"),
          })
          .from(sql`json_each(${json})`)
          .where(sql`1`),
      )
      .onConflictDoUpdate({
        target: [media.itemId, media.kind, media.sourceUrl],
        set: {
          finalUrl: sql`excluded.final_url`,
          position: sql`excluded.position`,
          outcome: sql`excluded.outcome`,
          reason: sql`excluded.reason`,
          fileKey: sql`excluded.file_key`,
          contentType: sql`excluded.content_type`,
          size: sql`excluded.size`,
        },
      }),
  ];
}
