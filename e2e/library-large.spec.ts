import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { SEARCH_LABEL } from "../web/src/text.ts";
import { choice, rowsInOrder } from "./filters.ts";
import {
  LIBRARY_SIZE,
  PAGE_SIZE,
  SEEDED,
  attachJson,
  firstPage,
  idsWhere,
  largeLibrary,
  openLibrary,
  pageAfter,
  results,
  scrollUntil,
  walk,
} from "./library-large.ts";
import { DESKTOP, storeSettings } from "./look.ts";

const library = largeLibrary();

const Shown = z.object({ at: z.number(), rows: z.number() });

async function rowsShown(page: Page) {
  await page.goto("/");

  const handle = await page.waitForFunction(
    () => {
      const shown = document.querySelectorAll("article.it").length;

      return shown > 0 ? { at: performance.now(), rows: shown } : false;
    },
    undefined,
    { timeout: 120_000 },
  );

  return Shown.parse(await handle.jsonValue());
}

async function timesIn(page: Page, layout: "list" | "grid") {
  await storeSettings(page, { layout, openAs: "page" });
  const times: { ms: number; rows: number }[] = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { at, rows } = await rowsShown(page);
    times.push({ ms: Math.round(at), rows });
  }

  return times;
}

async function measuredReads(request: APIRequestContext) {
  const reads: { bytes: number; ms: number; items: number }[] = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const started = performance.now();
    const response = await request.get("/api/items");
    const body = await response.body();
    const ms = Math.round(performance.now() - started);
    const { items } = z.object({ items: z.array(z.unknown()) }).parse(JSON.parse(body.toString()));
    reads.push({ bytes: body.length, ms, items: items.length });
  }

  return reads;
}

test("the first read answers 50 Items, a cursor and the counts of the whole library, and the cursor reads all 3000 once, newest saved first", async () => {
  const { screen, order } = library();
  const { request } = screen.context;
  const firstReads = await measuredReads(request);
  expect(order).toHaveLength(LIBRARY_SIZE);

  const first = await firstPage(request, {});
  expect(first.items).toHaveLength(PAGE_SIZE);
  expect(first.next).not.toBeNull();
  expect(first.items.map(({ id }) => id)).toEqual(order.slice(0, PAGE_SIZE));
  expect(first.counts.total).toBe(LIBRARY_SIZE);
  expect(first.counts.unread).toBe(SEEDED.unread);
  expect(first.counts.reads).toEqual([
    { key: "unread", count: SEEDED.unread },
    { key: "read", count: SEEDED.read },
  ]);
  expect(first.counts.sources.map(({ count }) => count)).toEqual([600, 600, 600, 600, 600]);
  expect(first.counts.topics.map(({ name, count }) => [name, count])).toEqual([
    ["Reading", 1000],
    ["Writing", 1000],
    ["Tools", 1000],
  ]);
  expect(first.counts.tags.map(({ name, count }) => [name, count])).toEqual([
    ["Design", SEEDED.designTag],
    ["Systems", SEEDED.systemsTag],
  ]);

  const walking = performance.now();
  const everything = await walk(request, {});

  await attachJson("list-read.json", {
    library: order.length,
    firstReads,
    walk: { ms: Math.round(performance.now() - walking), pages: everything.pages.length },
  });

  expect(everything.pages).toHaveLength(60);
  expect(everything.pages.slice(0, -1).every((page) => page.items.length === PAGE_SIZE)).toBe(true);
  expect(everything.ids).toEqual(order);
  expect(everything.pages.at(-1)?.next).toBeNull();
});

test("a page edge falls inside a run of Items saved at the same time, and the next page neither repeats nor skips one", async () => {
  const { screen, order } = library();

  const saved = screen.fresh.query(
    `SELECT saved_at AS savedAt FROM items WHERE id IN (${order[99]}, ${order[100]})`,
    z.array(z.object({ savedAt: z.number() })),
  );

  expect(saved).toHaveLength(2);
  expect(saved[0]?.savedAt).toBe(saved[1]?.savedAt);

  const { request } = screen.context;
  const first = await firstPage(request, {});
  const second = await pageAfter(request, {}, first.next);
  const third = await pageAfter(request, {}, second.next);

  expect([...second.items, ...third.items].map(({ id }) => id)).toEqual(order.slice(50, 150));
});

test("every filter keeps working with the cursor, and the counts of a filtered read cover the whole library", async () => {
  const { screen } = library();
  const { request } = screen.context;

  const cases = [
    {
      params: { q: "alpha", source: "reddit" },
      ids: idsWhere(screen, "source = 'reddit' AND title LIKE '% alpha'"),
    },
    {
      params: { topic: "reading", read: "unread" },
      ids: idsWhere(screen, "topic_id = 1 AND read_state = 'unread'"),
    },
    {
      params: { tag: "systems", source: "x" },
      ids: idsWhere(
        screen,
        "source = 'x' AND id IN (SELECT item_id FROM item_tags WHERE tag_id = 2)",
      ),
    },
    { params: { q: "2999" }, ids: idsWhere(screen, "title LIKE 'Saved link number 2999 %'") },
  ];

  for (const { params, ids } of cases) {
    const filtered = await walk(request, params);
    expect(filtered.ids, JSON.stringify(params)).toEqual(ids);
    expect(filtered.pages.slice(1).every((page) => page.counts === undefined)).toBe(true);
    expect(filtered.pages[0]?.counts?.total).toBe(LIBRARY_SIZE);
  }

  const reddit = await firstPage(request, { q: "alpha", source: "reddit" });
  expect(reddit.counts.sources.map(({ key, count }) => [key, count])).toEqual([
    ["reddit", SEEDED.alphaOfReddit],
    ["x", SEEDED.alphaOfReddit],
    ["github", SEEDED.alphaOfReddit],
    ["article", SEEDED.alphaOfReddit],
    ["other", SEEDED.alphaOfReddit],
  ]);
});

test("a malformed cursor answers 400, and a well-formed cursor that no page gave answers the Items after its position", async () => {
  const { screen, order } = library();
  const { request } = screen.context;

  for (const cursor of ["abc", "1", "1.2.3", "-1.2", "9007199254740993.1", "1.9007199254740993"]) {
    const response = await request.get("/api/items", { params: { cursor } });
    expect(response.status(), cursor).toBe(400);
  }

  const beyond = await pageAfter(request, {}, "1.1");
  expect(beyond.items).toEqual([]);
  expect(beyond.next).toBeNull();

  const newest = await pageAfter(request, {}, "9007199254740991.9007199254740991");
  expect(newest.items.map(({ id }) => id)).toEqual(order.slice(0, PAGE_SIZE));
});

test("records the time from navigation to the rows in List and Grid", async () => {
  const { page } = library().screen;
  await page.setViewportSize(DESKTOP);

  await attachJson("list-render.json", {
    list: await timesIn(page, "list"),
    grid: await timesIn(page, "grid"),
  });
});

for (const layout of ["list", "grid"] as const) {
  test(`${layout}: the first screen holds 50 rows, scrolling to the end loads every Item once and in order, and the counts stay those of the library`, async () => {
    const { screen, order } = library();
    const { page } = screen;
    await openLibrary(page, layout);

    const rows = page.locator("article.it");
    await expect(rows).toHaveCount(PAGE_SIZE);
    await expect(results(page)).toHaveText("3000 items, 2250 unread");
    await expect(choice(page, "Source", "Reddit")).toContainText("600");
    await expect(choice(page, "Read state", "Unread")).toContainText("2250");
    await expect(choice(page, "Read state", "Read")).toContainText("750");

    await scrollUntil(page, LIBRARY_SIZE);
    expect(await rowsInOrder(page)).toEqual(order);
    await expect(page.locator(".it-ghost")).toHaveCount(0);
    await expect(results(page)).toHaveText("3000 items, 2250 unread");
    await expect(choice(page, "Source", "Reddit")).toContainText("600");

    await choice(page, "Source", "Reddit").click();
    await expect(results(page)).toHaveText("600 of 3000 items");
    await expect(rows).toHaveCount(PAGE_SIZE);
    await scrollUntil(page, 600);
    expect(await rowsInOrder(page)).toEqual(idsWhere(screen, "source = 'reddit'"));
  });
}

test("a jump straight to the end of a short window loads the next page", async () => {
  const { page } = library().screen;
  await storeSettings(page, { layout: "list", openAs: "page" });
  await page.setViewportSize({ width: DESKTOP.width, height: 300 });
  await page.goto("/");

  const rows = page.locator("article.it");
  await expect(rows).toHaveCount(PAGE_SIZE);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(2 * PAGE_SIZE);
});

test("a search that leaves as many rows as the list had still loads the next page when the list is scrolled", async () => {
  const { screen } = library();
  const { page } = screen;
  await openLibrary(page, "list");

  const rows = page.locator("article.it");
  await expect(rows).toHaveCount(PAGE_SIZE);
  await page.getByRole("searchbox", { name: SEARCH_LABEL }).fill("alpha");

  const matching = idsWhere(screen, "title LIKE '% alpha'");

  await expect
    .poll(async () => (await rowsInOrder(page)).join(","))
    .toBe(matching.slice(0, PAGE_SIZE).join(","));

  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(2 * PAGE_SIZE);
});
