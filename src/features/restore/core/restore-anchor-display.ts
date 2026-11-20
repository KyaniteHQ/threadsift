import { and, eq, sql } from "drizzle-orm";

import { utf8Length } from "../../../core/contract/encoding.ts";
import { RESTORE_ANCHOR_BYTES } from "../../../core/contract/restore-contract.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { items, redditComments } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { type AnchorSnapshot, commentIdsOf } from "../../item/core/highlight-publish.ts";
import { readPostTextWithin } from "../../thread/core/post-text.ts";
import { commentReadable, readGeneration } from "../../thread/core/thread-store.ts";

export type Note = (kept: number, read: number) => void;

type Display = Readonly<{
  post?: string | null;
  comments?: readonly Readonly<{ id: string; body: string | null }>[];
}>;

export async function postDisplay(
  { db, files }: Readonly<Pick<JobPorts, "db" | "files">>,
  snapshot: Readonly<AnchorSnapshot>,
  note: Note,
): Promise<Display> {
  const wanting = snapshot.highlights.filter(({ commentId }) => commentId === null).length;

  if (wanting === 0 || snapshot.itemId === null) return {};

  const [item] = await db
    .select({ postText: items.postText, postTextKey: items.postTextKey })
    .from(items)
    .where(eq(items.id, snapshot.itemId));

  if (item === undefined) return {};

  if (item.postTextKey === null) {
    const size = utf8Length(item.postText ?? "");

    if (size > RESTORE_ANCHOR_BYTES) {
      note(wanting, 0);

      return {};
    }

    note(0, size);

    return { post: item.postText };
  }

  const read = await readPostTextWithin(
    files,
    snapshot.itemId,
    item.postTextKey,
    RESTORE_ANCHOR_BYTES,
  );

  if (read.kind === "text") {
    note(0, utf8Length(read.text));

    return { post: read.text };
  }

  note(wanting, 0);

  return {};
}

export async function commentDisplay(
  { db }: Readonly<Pick<JobPorts, "db">>,
  snapshot: Readonly<AnchorSnapshot>,
  note: Note,
): Promise<Display> {
  const ids = commentIdsOf(snapshot);

  if (ids.length === 0 || snapshot.itemId === null) return {};

  const [thread] = await db
    .select({ generation: readGeneration(items.id) })
    .from(items)
    .where(eq(items.id, snapshot.itemId));

  const generation = thread?.generation ?? null;

  if (generation === null) return { comments: [] };

  const comments = await db
    .select({
      id: redditComments.id,
      body: sql<string | null>`case when ${commentReadable()} then ${redditComments.body} end`,
    })
    .from(redditComments)
    .where(
      and(
        eq(redditComments.itemId, snapshot.itemId),
        eq(redditComments.generation, generation),
        among(redditComments.id, ids),
      ),
    );

  const size = comments.reduce((sum, { body }) => sum + utf8Length(body ?? ""), 0);

  if (comments.some(({ body }) => utf8Length(body ?? "") > RESTORE_ANCHOR_BYTES)) {
    note(snapshot.highlights.filter(({ commentId }) => commentId !== null).length, 0);

    return {};
  }

  note(0, size);

  return { comments };
}
