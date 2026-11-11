import { eq } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { LISTED_COLUMNS, type ListedItemRow, selectItems } from "./item-selection.ts";
import { isRedditShareLink, isShortLink, parseLink } from "./links.ts";
import { paste } from "./paste.ts";
import type { Database, Ports } from "./ports.ts";
import { items } from "./schema.ts";
import { aliasedItem } from "./short-link-aliases.ts";

export interface BatchLink {
  readonly url: string;
  readonly digest?: Digest | undefined;
}

export type BatchEntry =
  | { readonly outcome: "added" | "known"; readonly item: ListedItemRow }
  | { readonly outcome: "refused"; readonly url: string };

export type BatchPaste =
  | { readonly kind: "done"; readonly entries: readonly BatchEntry[] }
  | { readonly kind: "updating" };

async function heldItem(db: Database, absoluteUrl: string): Promise<ListedItemRow | undefined> {
  const { normalizedUrl } = parseLink(absoluteUrl);

  const alias =
    isShortLink(absoluteUrl) || isRedditShareLink(absoluteUrl)
      ? await aliasedItem(db, normalizedUrl)
      : undefined;

  const [held] = await selectItems(db, LISTED_COLUMNS).where(
    eq(items.normalizedUrl, alias?.normalizedUrl ?? normalizedUrl),
  );

  return held;
}

async function pasteNew(
  ports: Ports,
  { url, digest }: Readonly<BatchLink>,
): Promise<BatchEntry | null> {
  const held = await heldItem(ports.db, url);

  if (held !== undefined) return { outcome: "known", item: held };

  const saved = await paste(ports, url, { digest });

  if (saved.kind === "updating") return null;

  if (saved.kind === "refused") return { outcome: "refused", url };

  if (saved.kind !== "saved") throw new Error(`Paste answered ${saved.kind} without content`);

  return { outcome: saved.created ? "added" : "known", item: saved.item };
}

export async function pasteBatch(ports: Ports, links: readonly BatchLink[]): Promise<BatchPaste> {
  const entries: BatchEntry[] = [];

  for (const link of links) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Links are saved one after the other, in the order given.
    const entry = await pasteNew(ports, link);

    if (entry === null) return { kind: "updating" };

    entries.push(entry);
  }

  return { kind: "done", entries };
}
