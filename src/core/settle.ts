import { eq } from "drizzle-orm";

import type { Concluded, Content } from "./details.ts";
import type { FetchResult } from "./fetch-results.ts";
import { NO_OPEN_JOBS, type StatusEvent, statusColumns } from "./item-status.ts";
import { sourceOf } from "./links.ts";
import type { Database } from "./ports.ts";
import { type ItemRow, items } from "./schema.ts";

type Settled = Pick<ItemRow, "fetch"> & {
  readonly event: Extract<StatusEvent, { kind: "settled" | "failed" }>;
} & Partial<
    Pick<
      ItemRow,
      "title" | "author" | "community" | "fetchedAt" | "source" | "kind" | "postText" | "postedAt"
    >
  >;

const NO_TEXT = { postText: null, postedAt: null } as const;

function textFields(content: Readonly<Content>) {
  switch (content.kind) {
    case "article":
    case "page":
      return { postText: content.postText, postedAt: content.postedAt };
    case "thread":
      return { postText: content.thread.postText, postedAt: content.thread.postedAt };
    case "github-repo":
      return { postText: content.readme, postedAt: null };
    case "link":
    case "empty-page":
      return NO_TEXT;
    default: {
      const exhaustive: never = content;

      throw new Error(exhaustive);
    }
  }
}

function contentFields(content: Readonly<Content>) {
  switch (content.kind) {
    case "page":
    case "empty-page":
    case "thread":
      return textFields(content);
    case "article":
    case "github-repo":
    case "link":
      return { source: sourceOf(content.kind), kind: content.kind, ...textFields(content) };
    default: {
      const exhaustive: never = content;

      throw new Error(exhaustive);
    }
  }
}

export function isRetryable(result: FetchResult): result is "timeout" | "network" {
  return result === "timeout" || result === "network";
}

function settle(fetched: Readonly<Concluded>, current: string | null, now: number): Settled {
  if (fetched.status === "ok") {
    const { content, ...found } = fetched.found;

    const settled: Settled = {
      event: { kind: "settled" },
      fetch: "ok",
      ...found,
      fetchedAt: now,
    };

    return content === null ? settled : { ...settled, ...contentFields(content) };
  }

  const result = fetched.status;

  if (isRetryable(result) && current === null) {
    return { event: { kind: "failed", reason: result }, fetch: result };
  }

  return { event: { kind: "settled" }, fetch: result };
}

export function settledNew(fetched: Readonly<Concluded>, now: number) {
  const { event, ...fields } = settle(fetched, null, now);

  return { ...fields, ...statusColumns(event, NO_OPEN_JOBS) };
}

export function settledKnown(fetched: Readonly<Concluded>, current: string | null, now: number) {
  const { event, ...fields } = settle(fetched, current, now);

  return { ...fields, ...statusColumns(event) };
}

export function failedFetch(db: Database, itemId: number, reason: "gave-up" | "rate-limited") {
  return db
    .update(items)
    .set({ ...statusColumns({ kind: "failed", reason }), pendingDigest: null })
    .where(eq(items.id, itemId));
}
