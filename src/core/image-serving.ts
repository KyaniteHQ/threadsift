import { and, eq } from "drizzle-orm";

import { parseFileKey } from "./file-keys.ts";
import { IMAGE_EXTENSIONS, type ImageType, declaredImageType } from "./image-type.ts";
import type { Ports } from "./ports.ts";
import { media } from "./schema.ts";

interface ServedImage {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: ImageType;
  readonly size: number;
  readonly filename: string;
}

export async function servedImage(
  { db, files }: Readonly<Pick<Ports, "db" | "files">>,
  key: string,
): Promise<ServedImage | null> {
  const parsed = parseFileKey(key);

  if (parsed === null) return null;

  const [row] = await db
    .select({ id: media.id, contentType: media.contentType, size: media.size })
    .from(media)
    .where(and(eq(media.itemId, Number(parsed.itemId)), eq(media.fileKey, key)));

  const contentType = declaredImageType(row?.contentType ?? null);

  if (row === undefined || contentType === null || row.size === null) return null;

  const body = await files.get(key);

  return body === null
    ? null
    : {
        body,
        contentType,
        size: row.size,
        filename: `image-${row.id}.${IMAGE_EXTENSIONS[contentType]}`,
      };
}
