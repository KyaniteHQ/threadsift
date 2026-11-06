import { type APIRequestContext, type Locator, type Page, expect } from "@playwright/test";
import { z } from "zod";

import type { FilterCounts } from "../src/core/item-filters.ts";
import type { Source } from "../src/core/kinds.ts";
import { ItemListResponseSchema } from "../src/http/schemas.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { digestOf, listed } from "./search.ts";

const ARTICLES = [
  { topic: "Reading", tags: ["Essays", "Craft"], read: true },
  { topic: "Reading", tags: ["Essays"], read: false },
  { topic: "Writing", tags: ["Craft"], read: true },
  { topic: "Tools", tags: ["Essays"], read: false },
  { topic: "Notes", tags: [], read: false },
  { topic: "Archive", tags: ["Craft"], read: false },
  { topic: "Misc", tags: ["Essays"], read: false },
] as const;

const LINK_ONLY = [
  { source: "reddit", kind: "reddit-post", url: "https://www.reddit.com/r/x/comments/1/linkonly/" },
  { source: "x", kind: "x-post", url: "https://x.com/someone/status/1" },
  { source: "github", kind: "github-repo", url: "https://github.com/someone/linkonly" },
  { source: "other", kind: "link", url: "https://example.com/linkonly" },
] as const;

export interface Library {
  readonly articles: readonly number[];
  readonly linkOnly: Readonly<Record<Exclude<Source, "article">, number>>;
  readonly everyone: readonly number[];
}

const IdsSchema = z.array(z.object({ id: z.number(), source: z.string() }));

export async function buildLibrary(screen: FreshScreen): Promise<Library> {
  const articles: number[] = [];

  for (const [index, { topic, tags }] of ARTICLES.entries()) {
    const digest = { ...digestOf(`Essay ${index + 1} title`, "x", "Summary text."), topic, tags };
    const saved = await postLinkRaw(screen.context.request, `${ESSAY}?v=${index + 1}`, digest);

    articles.push((await settled(screen.context.request, saved.body.item.id, 180_000)).id);
  }

  const now = Date.now();

  screen.fresh.sql(
    LINK_ONLY.map(
      ({ source, kind, url }, index) =>
        `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title) VALUES ('${source}', '${kind}', '${url}', '${url}', ${now + index}, 'ready', 'Linkonly ${source}')`,
    ).join("; "),
  );

  const stored = screen.fresh.query(
    "SELECT id, source FROM items WHERE source <> 'article'",
    IdsSchema,
  );

  const idOf = (source: string) => stored.find((row) => row.source === source)?.id ?? 0;

  const linkOnly = {
    reddit: idOf("reddit"),
    x: idOf("x"),
    github: idOf("github"),
    other: idOf("other"),
  };

  screen.fresh.sql(
    "INSERT INTO search_parts (item_id, kind, body) SELECT id, 'title', title FROM items WHERE source <> 'article'",
  );

  const reading = [articles[0], articles[2], linkOnly.github];
  screen.fresh.sql(`UPDATE items SET read_state = 'read' WHERE id IN (${reading.join(",")})`);

  return { articles, linkOnly, everyone: [...articles, ...Object.values(linkOnly)] };
}

export async function answer(request: APIRequestContext, params: Readonly<Record<string, string>>) {
  const { status, response } = await listed(request, params);
  expect(status, JSON.stringify(params)).toBe(200);

  return ItemListResponseSchema.parse(await response.json());
}

export function group(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

export function choice(page: Page, groupName: string, label: string): Locator {
  return group(page, groupName).getByRole("button", { name: new RegExp(`^${label}\\s*\\d`, "u") });
}

export async function rowIds(page: Page): Promise<number[]> {
  const keys = await page
    .locator("article.it")
    .evaluateAll((rows) =>
      rows.map((row) => (row instanceof HTMLElement ? (row.dataset["key"] ?? "") : "")),
    );

  return keys.map(Number).toSorted((left, right) => left - right);
}

export async function expectRows(
  page: Page,
  ids: readonly number[],
  timeout?: number,
): Promise<void> {
  await expect
    .poll(() => rowIds(page), timeout === undefined ? {} : { timeout })
    .toEqual(ids.toSorted((left, right) => left - right));
}

export function head(page: Page): Locator {
  return page.locator("#results");
}

function byKey(rows: readonly { readonly key: string; readonly count: number }[]) {
  return Object.fromEntries(rows.map(({ key, count }) => [key, count]));
}

export type Tallies = ReturnType<typeof tallies>;

export function tallies(counts: Readonly<FilterCounts>) {
  return {
    total: counts.total,
    unread: counts.unread,
    sources: byKey(counts.sources),
    reads: byKey(counts.reads),
    topics: byKey(counts.topics),
    tags: byKey(counts.tags),
  };
}

export function idsOf(items: readonly { readonly id: number }[]): number[] {
  return items.map(({ id }) => id).toSorted((left, right) => left - right);
}

export interface HeldRead {
  readonly reached: Promise<void>;
  readonly delivered: Promise<void>;
  release(): void;
}

export async function holdRead(page: Page, wanted: (url: URL) => boolean): Promise<HeldRead> {
  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();

  await page.route(/\/api\/items(\?|$)/u, async (route) => {
    if (!wanted(new URL(route.request().url()))) {
      await route.continue();

      return;
    }

    const held = route.request();

    page.on("requestfinished", (request) => {
      if (request === held) delivered.resolve();
    });

    const response = await route.fetch();
    reached.resolve();
    await gate.promise;
    await route.fulfill({ response });
  });

  return {
    reached: reached.promise,
    delivered: delivered.promise,
    release: () => {
      gate.resolve();
    },
  };
}

export interface Seen {
  readonly head: string;
  readonly rows: number;
}

declare global {
  interface Window {
    recordList(headText: string, rows: number): void;
  }
}

export async function watchList(page: Page): Promise<() => readonly Seen[]> {
  const seen: Seen[] = [];

  await page.exposeFunction("recordList", (headText: string, rows: number) => {
    const last = seen.at(-1);

    if (last?.head !== headText || last.rows !== rows) seen.push({ head: headText, rows });
  });

  await page.evaluate(() => {
    new MutationObserver(() => {
      window.recordList(
        document.querySelector("#results")?.textContent ?? "",
        document.querySelectorAll("article.it").length,
      );
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  return () => seen;
}
