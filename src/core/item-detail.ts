import { asc, eq, sql } from "drizzle-orm";

import { type ReaderDigest, parseStoredDigest } from "./ai-contract.ts";
import { highlightRows, highlightsViewOf } from "./highlights.ts";
import { DETAIL_COLUMNS, selectItems } from "./item-selection.ts";
import { noteRows, noteViewOf } from "./notes.ts";
import type { Ports } from "./ports.ts";
import { postTextOf, sizedImageRows, sizedImagesOf } from "./post-text.ts";
import { REPOSITORY_COLUMNS } from "./repositories.ts";
import { digests, githubRepos, itemTags, items, tags } from "./schema.ts";
import { commentsOf, threadReads } from "./thread-read.ts";

function readerDigest(
  id: number,
  stored: string | undefined,
  tagNames: readonly string[],
): ReaderDigest | null {
  if (stored === undefined) return null;

  try {
    const { summary, keyPoints } = parseStoredDigest(stored);

    return { summary, keyPoints, tags: tagNames };
  } catch (error) {
    console.error(`Digest of Item ${id} is not readable`, error);

    return null;
  }
}

export async function getItem(ports: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const first = await readItem(ports, id);

  return first?.textLost === true ? (await readItem(ports, id))?.item : first?.item;
}

async function readItem({ db, files }: Readonly<Pick<Ports, "db" | "files">>, id: number) {
  const [[row], [stored], tagRows, [repository], threadRows, threadReport, held, [note], sizes] =
    await db.batch([
      selectItems(db, {
        ...DETAIL_COLUMNS,
        revision: sql<number>`${items.generation}`.as("post_revision"),
      }).where(eq(items.id, id)),
      db.select({ digest: digests.digest }).from(digests).where(eq(digests.itemId, id)),
      db
        .select({ name: tags.name })
        .from(itemTags)
        .innerJoin(tags, eq(tags.id, itemTags.tagId))
        .where(eq(itemTags.itemId, id))
        .orderBy(asc(sql`${itemTags}.rowid`)),
      db.select(REPOSITORY_COLUMNS).from(githubRepos).where(eq(githubRepos.itemId, id)),
      ...threadReads(db, id),
      highlightRows(db, id),
      noteRows(db, id),
      sizedImageRows(db, id),
    ]);

  if (row === undefined) {
    return row;
  }

  const { revision, postTextKey, ...item } = row;
  const postText = await postTextOf(files, id, { postText: item.postText, postTextKey });

  return {
    textLost: postText === null && postTextKey !== null,
    item: {
      ...item,
      postText,
      digest: readerDigest(
        id,
        stored?.digest,
        tagRows.map((tag) => tag.name),
      ),
      repository: repository ?? null,
      images: sizedImagesOf(sizes),
      comments: commentsOf(threadRows, threadReport),
      highlights: highlightsViewOf(held, {
        post: revision,
        comments: threadReport[0]?.generation ?? null,
      }),
      note: noteViewOf(note),
    },
  };
}
