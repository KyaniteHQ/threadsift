import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { fileRouteOf } from "./file-keys.ts";
import { readerUrl } from "./reader-url.ts";
import { items, media } from "./schema.ts";

const FIRST_STORED = sql`from ${media} where ${media.itemId} = ${items.id} and ${media.outcome} = 'stored' order by ${media.position} limit 1`;

export const IMAGE_VIEW_COLUMNS = {
  imageKey: sql<string | null>`(select ${media.fileKey} ${FIRST_STORED})`.as("image_key"),
  imageAlt: sql<string | null>`(select ${media.alt} ${FIRST_STORED})`.as("image_alt"),
};

export function sizedImageRows(db: Database, itemId: number) {
  return db
    .select({
      key: media.fileKey,
      width: media.width,
      height: media.height,
      sourceUrl: media.sourceUrl,
    })
    .from(media)
    .where(
      and(
        eq(media.itemId, itemId),
        eq(media.outcome, "stored"),
        isNotNull(media.width),
        isNotNull(media.height),
      ),
    )
    .orderBy(asc(media.position));
}

type SizedRow = Readonly<{
  key: string | null;
  width: number | null;
  height: number | null;
  sourceUrl: string;
}>;

export function sizedImagesOf(rows: readonly SizedRow[]) {
  return rows.flatMap(({ key, width, height, sourceUrl }) =>
    key === null || width === null || height === null
      ? []
      : [{ url: fileRouteOf(key), width, height, sourceUrl: readerUrl(sourceUrl) }],
  );
}
