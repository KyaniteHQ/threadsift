import { type SQL, eq } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded, Content } from "./details.ts";
import type { FetchResult } from "./fetch-results.ts";
import type { XReadNote } from "./kinds.ts";
import { sourceOf } from "./links.ts";
import { type ItemRow, items } from "./schema.ts";

type Settled = Pick<ItemRow, "fetch" | "xNote" | "reason"> &
  Partial<
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

export function settle(fetched: Readonly<Concluded>, current: string | null, now: number): Settled {
  const xNote = fetched.note ?? null;

  if (fetched.status === "ok") {
    const { content, ...found } = fetched.found;

    const settled: Settled = {
      reason: null,
      fetch: "ok",
      xNote,
      ...found,
      fetchedAt: now,
    };

    return content === null ? settled : { ...settled, ...contentFields(content) };
  }

  const result = fetched.status;

  if (isRetryable(result) && current === null) {
    return { reason: result, fetch: result, xNote };
  }

  return { reason: null, fetch: result, xNote };
}

export function failedFetch(
  db: Database,
  itemId: number,
  reason: "gave-up" | "rate-limited",
  xNote: XReadNote | SQL<XReadNote | null> | null,
) {
  return db.update(items).set({ reason, xNote, pendingDigest: null }).where(eq(items.id, itemId));
}
