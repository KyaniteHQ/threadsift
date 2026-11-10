import { eq } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import type { SaveResult } from "./items.ts";
import { type RedditRef, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { parseRedditPage } from "./reddit-page.ts";
import { redditComments } from "./reddit-tables.ts";
import { items } from "./schema.ts";
import type { SuppliedPage } from "./supplied-page.ts";
import { publish } from "./thread-paste.ts";

interface PageRefusal {
  readonly kind: "invalid";
  readonly field: "page";
  readonly reason: string;
}

interface ThreadKept {
  readonly kind: "thread-kept";
}

async function holdsThread(db: Database, normalizedUrl: string): Promise<boolean> {
  const [row] = await db
    .select({ itemId: redditComments.itemId })
    .from(redditComments)
    .innerJoin(items, eq(items.id, redditComments.itemId))
    .where(eq(items.normalizedUrl, normalizedUrl))
    .limit(1);

  return row !== undefined;
}

export async function saveThreadPage(
  ports: Ports,
  absoluteUrl: string,
  {
    digest,
    page,
    ref,
  }: Readonly<{ digest: Digest | undefined; page: SuppliedPage; ref: RedditRef }>,
): Promise<SaveResult | PageRefusal | ThreadKept> {
  if (await holdsThread(ports.db, parseLink(absoluteUrl).normalizedUrl)) {
    return { kind: "thread-kept" };
  }

  const parsed = parseRedditPage(page, ref);

  if (parsed.kind === "refused") {
    return { kind: "invalid", field: "page", reason: parsed.reason };
  }

  return publish(ports, absoluteUrl, parsed.thread, digest);
}
