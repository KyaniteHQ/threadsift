import { type SQL, eq } from "drizzle-orm";

import type { Database } from "./database.ts";
import type { Concluded, Content } from "./details.ts";
import type { FetchResult } from "./fetch-results.ts";
import { SOURCE_OF_KIND } from "./item-contract.ts";
import { type ItemRow, items } from "./schema.ts";
import type { StoredThread } from "./stored-thread.ts";
import type { XReadNote } from "./x-read-note.ts";

export type Settled = Pick<ItemRow, "fetch" | "xNote" | "reason"> &
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
      return { source: SOURCE_OF_KIND[content.kind], kind: content.kind, ...textFields(content) };
    default: {
      const exhaustive: never = content;

      throw new Error(exhaustive);
    }
  }
}

export function postTextOf(fetched: Readonly<Concluded>): string | null | undefined {
  const content = fetched.status === "ok" ? fetched.found.content : null;

  return content === null ? undefined : textFields(content).postText;
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

export function fetchedThread(thread: Readonly<StoredThread>): Concluded {
  const { title, author, community } = thread;

  return {
    status: "ok",
    found: { title, author, community, content: { kind: "thread", thread, archivedAt: null } },
  };
}

export function withdrawnFetch(
  db: Database,
  itemId: number,
  fetch: "status" | "unreadable",
  xNote: XReadNote | null,
) {
  return db
    .update(items)
    .set({ fetch, xNote, reason: null, pendingDigest: null })
    .where(eq(items.id, itemId));
}

export function reopenedFetch(db: Database, where: SQL, pendingDigest: string | null) {
  return db.update(items).set({ reason: null, pendingDigest }).where(where);
}

export function failedFetch(
  db: Database,
  itemId: number,
  reason: "gave-up" | "rate-limited",
  xNote: XReadNote | SQL<XReadNote | null> | null,
) {
  return db.update(items).set({ reason, xNote, pendingDigest: null }).where(eq(items.id, itemId));
}
