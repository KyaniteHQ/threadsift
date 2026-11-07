import { z } from "zod";

import type { COMMENT_KINDS } from "./reddit-tables.ts";

const Place = {
  id: z.string(),
  parentId: z.string().nullable(),
  depth: z.number().int().nonnegative(),
};

export const CommentNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("comment"),
    ...Place,
    author: z.string().nullable(),
    body: z.string(),
    score: z.number().int().nullable(),
    postedAt: z.number().int().nullable(),
  }),
  z.object({ kind: z.literal("stub"), ...Place, reason: z.enum(["dropped", "not-kept"]) }),
  z.object({ kind: z.literal("more"), ...Place }),
]);

export const CommentsViewSchema = z.object({
  reported: z.number().int().nonnegative().nullable(),
  received: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  nodes: z.array(CommentNodeSchema).readonly(),
});

export type CommentNode = z.infer<typeof CommentNodeSchema>;

export type CommentsView = z.infer<typeof CommentsViewSchema>;

export interface CommentRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly kind: (typeof COMMENT_KINDS)[number];
  readonly eligible: boolean;
  readonly kept: boolean;
  readonly author: string | null;
  readonly body: string | null;
  readonly score: number | null;
  readonly postedAt: number | null;
}

export const NO_COMMENTS: CommentsView = { reported: null, received: 0, kept: 0, nodes: [] };

function keptWithAncestors(rows: readonly CommentRow[]): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const shown = new Set<string>();

  for (const row of rows.filter((candidate) => candidate.kept)) {
    for (
      let at: CommentRow | undefined = row;
      at !== undefined && !shown.has(at.id);
      at = at.parentId === null ? undefined : byId.get(at.parentId)
    ) {
      shown.add(at.id);
    }
  }

  return shown;
}

function shownIds(rows: readonly CommentRow[]): ReadonlySet<string> {
  const shown = keptWithAncestors(rows);

  for (const row of rows) {
    if (row.kind === "more" && (row.parentId === null || shown.has(row.parentId))) {
      shown.add(row.id);
    }
  }

  return shown;
}

function nodeOf(row: Readonly<CommentRow>): CommentNode {
  const { id, parentId, depth } = row;

  if (row.kind === "more") return { kind: "more", id, parentId, depth };

  if (!row.kept) {
    return { kind: "stub", id, parentId, depth, reason: row.eligible ? "not-kept" : "dropped" };
  }

  return {
    kind: "comment",
    id,
    parentId,
    depth,
    author: row.author,
    body: row.body ?? "",
    score: row.score,
    postedAt: row.postedAt,
  };
}

export function commentsViewOf(rows: readonly CommentRow[], reported: number | null): CommentsView {
  const shown = shownIds(rows);

  return {
    reported,
    received: rows.filter((row) => row.kind === "comment").length,
    kept: rows.filter((row) => row.kept).length,
    nodes: rows.flatMap((row) => (shown.has(row.id) ? [nodeOf(row)] : [])),
  };
}
