import { type SQL, and, asc, eq, exists, sql } from "drizzle-orm";

import { selectorHolds } from "../../../core/contract/highlight-anchor.ts";
import type {
  CreateHighlightRequest,
  Highlight,
  HighlightTarget,
  HighlightsView,
} from "../../../core/contract/highlight-contract.ts";
import { projectText } from "../../../core/contract/text-projection.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, heldOffWrite, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { type HighlightRow, highlights, items, searchParts } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { postTextOf } from "../../thread/core/post-text.ts";
import { readableBody } from "../../thread/core/thread-read.ts";
import { readGeneration } from "../../thread/core/thread-store.ts";
import { highlightPartWrites } from "./search.ts";

type CreatedHighlight =
  | { readonly kind: "created" | "existing"; readonly highlight: Highlight }
  | { readonly kind: "no-item" | "no-comment" | "stale" | "mismatch" }
  | Closed;

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
    createdAt: Date.now(),
    status: "attached",
    start: selector.hint,
  });
}

function saveHighlight(
  db: Database,
  itemId: number,
  request: Readonly<CreateHighlightRequest>,
): Promise<HighlightRow | null | Closed> {
  const item = eq(items.id, itemId);

  return whileOpen(async () => {
    const [saved] =
      (await heldOffWrite(
        db,
        sql`${revisionHolds(itemId, request.target, request.revision)} and not exists ${existingHighlight(db, itemId, request)}`,
        highlightInsert(db, itemId, request).returning(),
        [...highlightPartWrites(db, item), ...STALE.itemChanged(db, item)],
      )) ?? [];

    return saved ?? null;
  });
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

  if (saved === null) return createHighlight(ports, itemId, request);

  return "kind" in saved ? saved : { kind: "created", highlight: highlightOf(saved, revisions) };
}

export function removalWrites(db: Database, itemId: number, highlightId: number) {
  const target = and(eq(highlights.id, highlightId), eq(highlights.itemId, itemId));
  const held = exists(db.select({ id: highlights.id }).from(highlights).where(target));
  return [
    db
      .delete(searchParts)
      .where(and(eq(searchParts.highlightId, highlightId), eq(searchParts.itemId, itemId))),
    ...STALE.itemChanged(db, sql`${eq(items.id, itemId)} and ${held}`),
    db.delete(highlights).where(target).returning({ id: highlights.id }),
  ] as const;
}

export async function removeHighlight(
  db: Database,
  itemId: number,
  highlightId: number,
): Promise<boolean> {
  const [, , removed] = await db.batch(removalWrites(db, itemId, highlightId));

  return removed.length > 0;
}
