import { z } from "zod";

import type { DigestOutcome } from "./kinds.ts";
import type { COMMENT_KINDS } from "./reddit-tables.ts";
import { WholeCount } from "./whole-count.ts";

const Place = {
  id: z.string(),
  parentId: z.string().nullable(),
  depth: WholeCount,
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
  z.object({
    kind: z.literal("stub"),
    ...Place,
    reason: z.enum(["dropped", "not-kept", "not-saved"]),
  }),
  z.object({ kind: z.literal("more"), ...Place }),
]);

const UnfilteredCauseSchema = z.enum(["pending", "failed", "no-provider", "not-run", "older"]);

export type UnfilteredCause = z.infer<typeof UnfilteredCauseSchema>;

export const CommentCountSchema = z.object({
  filter: z.enum(["kept", "unfiltered"]),
  shown: WholeCount,
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
  reported: WholeCount.nullable(),
  archive: z.object({ at: WholeCount, withPost: z.boolean() }).nullable(),
  received: WholeCount,
  kept: WholeCount,
  nodes: z.array(CommentNodeSchema).readonly(),
  view: ViewSchema,
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

function visibleNodes(rows: readonly CommentRow[]): CommentNode[] {
  const shown = shownIds(rows);
  const missing = new Set<string>();
  const nodes: CommentNode[] = [];

  for (const row of rows) {
    if (!shown.has(row.id)) continue;

    const { parentId } = row;

    if (parentId !== null && !shown.has(parentId) && !missing.has(parentId)) {
      nodes.push({ kind: "stub", id: parentId, parentId: null, depth: 0, reason: "not-saved" });
      missing.add(parentId);
    }

    nodes.push(nodeOf(row));
  }

  return nodes;
}

interface ThreadCounts {
  readonly received: number;
  readonly shown: number;
  readonly kept: number;
  readonly reported: number | null;
}

function totalOf({ reported, received }: Readonly<Pick<ThreadCounts, "reported" | "received">>) {
  return Math.max(reported ?? 0, received);
}

type Standing = "absent" | "removed" | "kept" | "unfiltered";

function standingOf(
  published: boolean,
  { received, shown }: Readonly<Pick<ThreadCounts, "received" | "shown">>,
): Standing {
  if (received === 0) return "absent";

  if (published) return "kept";

  return shown === 0 ? "removed" : "unfiltered";
}

function countOf(
  filter: CommentCount["filter"],
  counts: Readonly<Pick<ThreadCounts, "received" | "shown" | "reported">>,
): CommentCount {
  return { filter, shown: counts.shown, total: totalOf(counts) };
}

function viewOf(
  { published, digest }: Readonly<Pick<ThreadReport, "published" | "digest">>,
  counts: Readonly<ThreadCounts>,
): CommentsFilter {
  const standing = standingOf(published, counts);

  switch (standing) {
    case "absent":
      return { filter: "absent" };
    case "removed":
      return { filter: "removed" };
    case "kept": {
      const count = countOf("kept", counts);

      return counts.kept === 0 ? { filter: "nothing-kept", count } : { filter: "kept", count };
    }
    case "unfiltered":
      return { filter: "unfiltered", cause: causeOf(digest), count: countOf("unfiltered", counts) };
    default:
      return standing satisfies never;
  }
}

export function commentsViewOf(
  rows: readonly CommentRow[],
  { reported, archive, published, digest }: Readonly<ThreadReport>,
): CommentsView {
  const comments = rows.filter((row) => row.kind === "comment");

  const counts: ThreadCounts = {
    received: comments.length,
    shown: comments.filter((row) => row.readable).length,
    kept: comments.filter((row) => row.kept).length,
    reported,
  };

  const view = viewOf({ published, digest }, counts);

  return {
    reported,
    archive,
    received: counts.received,
    kept: counts.kept,
    nodes: view.filter === "removed" ? [] : visibleNodes(rows),
    view,
  };
}

export interface CountColumns {
  readonly commentsPublished: boolean;
  readonly commentsReceived: number;
  readonly commentsShown: number;
  readonly commentsReported: number | null;
}

export function commentCountOf({
  commentsPublished: published,
  commentsReceived: received,
  commentsShown: shown,
  commentsReported: reported,
}: Readonly<CountColumns>): CommentCount | null {
  const counts = { received, shown, reported };
  const standing = standingOf(published, counts);

  return standing === "kept" || standing === "unfiltered" ? countOf(standing, counts) : null;
}
