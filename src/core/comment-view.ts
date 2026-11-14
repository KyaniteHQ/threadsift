import { z } from "zod";

import type { DigestOutcome } from "./kinds.ts";
import type { COMMENT_KINDS } from "./reddit-tables.ts";

const Place = {
  id: z.string(),
  parentId: z.string().nullable(),
  depth: z.number().int().nonnegative(),
};

const CommentNodeSchema = z.discriminatedUnion("kind", [
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

const UnfilteredCauseSchema = z.enum(["pending", "failed", "no-provider", "not-run", "older"]);

export type UnfilteredCause = z.infer<typeof UnfilteredCauseSchema>;

export const CommentCountSchema = z.object({
  filter: z.enum(["kept", "unfiltered"]),
  shown: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});

export type CommentCount = z.infer<typeof CommentCountSchema>;

const ViewSchema = z.discriminatedUnion("filter", [
  z.object({ filter: z.literal("absent") }),
  z.object({ filter: z.literal("removed") }),
  z.object({
    filter: z.literal("unfiltered"),
    cause: UnfilteredCauseSchema,
    count: CommentCountSchema,
  }),
  z.object({ filter: z.literal("kept"), count: CommentCountSchema }),
  z.object({ filter: z.literal("nothing-kept"), count: CommentCountSchema }),
]);

export type CommentsFilter = z.infer<typeof ViewSchema>;

export const CommentsViewSchema = z.object({
  reported: z.number().int().nonnegative().nullable(),
  archive: z.object({ at: z.number().int().nonnegative(), withPost: z.boolean() }).nullable(),
  received: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  nodes: z.array(CommentNodeSchema).readonly(),
  view: ViewSchema.optional(),
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
  readonly readable: boolean;
  readonly author: string | null;
  readonly body: string | null;
  readonly score: number | null;
  readonly postedAt: number | null;
}

export interface ThreadReport {
  readonly reported: number | null;
  readonly archive: { readonly at: number; readonly withPost: boolean } | null;
  readonly published: boolean;
  readonly digest: {
    readonly outcome: DigestOutcome;
    readonly stored: boolean;
    readonly provider: boolean;
  };
}

export const NO_COMMENTS: CommentsView = {
  reported: null,
  archive: null,
  received: 0,
  kept: 0,
  nodes: [],
  view: { filter: "absent" },
};

function causeOf({ outcome, stored, provider }: Readonly<ThreadReport["digest"]>): UnfilteredCause {
  if (outcome !== "none") return outcome;

  if (stored) return "older";

  return provider ? "not-run" : "no-provider";
}

function readableWithAncestors(rows: readonly CommentRow[]): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const shown = new Set<string>();

  for (const row of rows.filter((candidate) => candidate.readable)) {
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
  const shown = readableWithAncestors(rows);

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

  if (!row.readable) {
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

function viewOf(
  { published, digest }: Readonly<Pick<ThreadReport, "published" | "digest">>,
  { shown, total }: Readonly<{ shown: number; total: number }>,
): CommentsFilter {
  if (total === 0) return { filter: "absent" };

  if (published) {
    const count = { filter: "kept", shown, total } as const;

    return shown === 0 ? { filter: "nothing-kept", count } : { filter: "kept", count };
  }

  if (shown === 0) return { filter: "removed" };

  return {
    filter: "unfiltered",
    cause: causeOf(digest),
    count: { filter: "unfiltered", shown, total },
  };
}

export function commentsViewOf(
  rows: readonly CommentRow[],
  { reported, archive, published, digest }: Readonly<ThreadReport>,
): CommentsView {
  const shown = shownIds(rows);
  const comments = rows.filter((row) => row.kind === "comment");

  const view = viewOf(
    { published, digest },
    {
      shown: comments.filter((row) => row.readable).length,
      total: Math.max(reported ?? 0, comments.length),
    },
  );

  return {
    reported,
    archive,
    received: comments.length,
    kept: comments.filter((row) => row.kept).length,
    nodes:
      view.filter === "removed"
        ? []
        : rows.flatMap((row) => (shown.has(row.id) ? [nodeOf(row)] : [])),
    view,
  };
}

export interface CountColumns {
  readonly commentsFilter: CommentCount["filter"] | null;
  readonly commentsShown: number | null;
  readonly commentsOutOf: number | null;
}

export function commentCountOf({
  commentsFilter: filter,
  commentsShown: shown,
  commentsOutOf: total,
}: Readonly<CountColumns>): CommentCount | null {
  if (filter === null || shown === null || total === null || total === 0) return null;

  return filter === "unfiltered" && shown === 0 ? null : { filter, shown, total };
}
