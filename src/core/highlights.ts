import { type SQL, and, asc, eq, sql } from "drizzle-orm";

import { selectorHolds } from "./highlight-anchor.ts";
import {
  type CreateHighlightRequest,
  type Highlight,
  type HighlightTarget,
  type HighlightsView,
} from "./highlight-contract.ts";
import type { Database, Ports } from "./ports.ts";
import { postTextOf } from "./post-text.ts";
import { readGeneration } from "./reddit-thread.ts";
import { type HighlightRow, guardedWrite, highlights, items, searchParts } from "./schema.ts";
import { highlightPartWrites } from "./search.ts";
import { PROJECTION_VERSION, projectText } from "./text-projection.ts";
import { readableBody } from "./thread-read.ts";

export type CreatedHighlight =
  | { readonly kind: "created" | "existing"; readonly highlight: Highlight }
  | { readonly kind: "no-item" | "no-comment" | "stale" | "mismatch" };

type Revisions = Readonly<{ post: number; comments: number | null }>;

function targetOf(row: Readonly<HighlightRow>): HighlightTarget {
  return row.commentId === null ? { kind: "post" } : { kind: "comment", commentId: row.commentId };
}

function highlightOf(row: Readonly<HighlightRow>, revisions: Revisions): Highlight {
  const revision = row.commentId === null ? revisions.post : revisions.comments;

  const recorded = {
    id: row.id,
    target: targetOf(row),
    selector: { exact: row.exact, prefix: row.prefix, suffix: row.suffix, hint: row.hint },
    projection: row.projection,
    createdAt: row.createdAt,
  };

  if (row.status !== "attached") {
    return { ...recorded, status: "unattached", reason: row.status, revision };
  }

  if (row.start === null || revision === null) {
    throw new Error(`Highlight ${String(row.id)} is attached and has no place`);
  }

  return { ...recorded, status: "attached", revision, start: row.start };
}

export function highlightRows(db: Database, itemId: number) {
  return db
    .select()
    .from(highlights)
    .where(eq(highlights.itemId, itemId))
    .orderBy(asc(highlights.id));
}

export function highlightsViewOf(
  rows: readonly HighlightRow[],
  revisions: Revisions,
): HighlightsView {
  return { revisions, items: rows.map((row) => highlightOf(row, revisions)) };
}

function revisionHolds(itemId: number, target: Readonly<HighlightTarget>, revision: number): SQL {
  const current = target.kind === "post" ? items.generation : readGeneration(items.id);

  return sql`exists (select 1 from ${items} where ${items.id} = ${itemId} and ${current} = ${revision})`;
}

function existingHighlight(
  db: Database,
  itemId: number,
  { target, selector }: Readonly<CreateHighlightRequest>,
) {
  return db
    .select()
    .from(highlights)
    .where(
      and(
        eq(highlights.itemId, itemId),
        target.kind === "post"
          ? sql`${highlights.commentId} is null`
          : eq(highlights.commentId, target.commentId),
        eq(highlights.status, "attached"),
        eq(highlights.start, selector.hint),
        eq(highlights.exact, selector.exact),
      ),
    );
}

function highlightInsert(
  db: Database,
  itemId: number,
  { target, selector }: Readonly<CreateHighlightRequest>,
) {
  return db.insert(highlights).values({
    itemId,
    commentId: target.kind === "post" ? null : target.commentId,
    ...selector,
    projection: PROJECTION_VERSION,
    createdAt: Date.now(),
    status: "attached",
    start: selector.hint,
  });
}

async function saveHighlight(
  db: Database,
  itemId: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<HighlightRow | null> {
  const [saved] =
    (await guardedWrite(
      db,
      sql`${revisionHolds(itemId, request.target, request.revision)} and not exists ${existingHighlight(db, itemId, request)}`,
      highlightInsert(db, itemId, request).returning(),
      highlightPartWrites(db, eq(items.id, itemId)),
    )) ?? [];

  return saved ?? null;
}

function readCreateInputs(db: Database, itemId: number, request: Readonly<CreateHighlightRequest>) {
  const { target, revision } = request;

  return db.batch([
    db
      .select({
        generation: items.generation,
        postText: items.postText,
        postTextKey: items.postTextKey,
        comments: readGeneration(items.id),
      })
      .from(items)
      .where(eq(items.id, itemId)),
    readableBody(db, itemId, target.kind === "comment" ? target.commentId : null, revision),
    existingHighlight(db, itemId, request),
  ]);
}

export async function createHighlight(
  ports: Readonly<Pick<Ports, "db" | "files">>,
  itemId: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<CreatedHighlight> {
  const { db } = ports;
  const { target, revision, selector } = request;

  const [[item], [comment], [known]] = await readCreateInputs(db, itemId, request);

  if (item === undefined) return { kind: "no-item" };

  const current = target.kind === "post" ? item.generation : item.comments;

  if (current === null) return { kind: "no-comment" };

  if (current !== revision) return { kind: "stale" };

  const text =
    target.kind === "comment"
      ? (comment?.body ?? null)
      : await postTextOf(ports.files, itemId, item);

  if (target.kind === "comment" && text === null) return { kind: "no-comment" };

  if (!selectorHolds(projectText(text ?? ""), selector, selector.hint)) return { kind: "mismatch" };

  const revisions = { post: item.generation, comments: item.comments };

  if (known !== undefined) {
    return { kind: "existing", highlight: highlightOf(known, revisions) };
  }

  const saved = await saveHighlight(db, itemId, request);

  return saved === null
    ? createHighlight(ports, itemId, request)
    : { kind: "created", highlight: highlightOf(saved, revisions) };
}

export function removalWrites(db: Database, itemId: number, highlightId: number) {
  return [
    db
      .delete(searchParts)
      .where(and(eq(searchParts.highlightId, highlightId), eq(searchParts.itemId, itemId))),
    db
      .delete(highlights)
      .where(and(eq(highlights.id, highlightId), eq(highlights.itemId, itemId)))
      .returning({ id: highlights.id }),
  ] as const;
}

export async function removeHighlight(
  db: Database,
  itemId: number,
  highlightId: number,
): Promise<boolean> {
  const [, removed] = await db.batch(removalWrites(db, itemId, highlightId));

  return removed.length > 0;
}
