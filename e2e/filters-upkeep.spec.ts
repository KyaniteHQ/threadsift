import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { ADDED, READING, cardTitle, countListReads, pasteForId } from "./card.ts";
import { choice, expectRows, group, head, holdRead } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteBehindDeferredFetch } from "./ingest.ts";
import { dismissButton, pasteCard } from "./links.ts";
import { digestOf } from "./search.ts";

let screen: FreshScreen;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("an empty library shows no search field and no pane, and Items without a Topic or Tag show the empty notes", async () => {
  const { page } = screen;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(group(page, "Source")).toHaveCount(0);

  screen.fresh.sql(
    "INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title) VALUES ('other', 'link', 'https://example.com/a', 'https://example.com/a', 1, 'ready', 'A page')",
  );

  await page.goto("/");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(group(page, "Topic").getByText("No topics yet")).toBeVisible();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(group(page, "Tags").getByText("No tags yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
});

test("a Paste that the Topic filter hides appears without a reload once its Digest names the Topic, and the paste card keeps working", async () => {
  const { page, context } = screen;
  const kept = await postLinkRaw(context.request, ESSAY, digestOf("Kept essay", "Craft", "Kept."));
  await settled(context.request, kept.body.item.id, 180_000);

  let loads = 0;
  await page.goto("/");

  page.on("load", () => {
    loads += 1;
  });

  await choice(page, "Topic", "Reading").click();
  await expectRows(page, [kept.body.item.id]);

  const late = `${ESSAY}?v=late`;

  const [id = 0] = await pasteBehindDeferredFetch(screen, async () => {
    const pasted = await pasteForId(page, late);
    await expect(cardTitle(page)).toHaveText(READING);
    await expectRows(page, [kept.body.item.id]);

    const refreshed = await postLinkRaw(
      context.request,
      late,
      digestOf("Late essay", "Craft", "Late."),
    );

    expect(refreshed.status).toBe(200);

    return [pasted];
  });

  await expectRows(page, [kept.body.item.id, id], 150_000);
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 150_000 });
  await expect(choice(page, "Topic", "Reading")).toHaveAttribute("aria-pressed", "true");
  expect(loads).toBe(0);

  await dismissButton(page).click();
  await expect(pasteCard(page)).toHaveCount(0);
});

test("an unfiltered Paste updates the head and the Source counts without reading the list again", async () => {
  const { page, context } = screen;
  const kept = await postLinkRaw(context.request, ESSAY, digestOf("Kept essay", "Craft", "Kept."));
  await settled(context.request, kept.body.item.id, 180_000);
  await page.goto("/");
  await expect(head(page)).toHaveText("1 item, 1 unread");
  const reads = countListReads(page);

  const id = await pasteForId(page, `${ESSAY}?v=counted`);
  await expectRows(page, [kept.body.item.id, id]);
  await expect(head(page)).toHaveText("2 items, 2 unread");
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 150_000 });
  await expect(choice(page, "Source", "Article")).toContainText("2");
  await expect(choice(page, "Source", "Other")).toContainText("0");
  reads.expectNoNewReads();
});

test("an unfiltered Item whose Digest publishes adds its Topic and Tag to the pane without a reload", async () => {
  const { page, context } = screen;
  const kept = await postLinkRaw(context.request, ESSAY, digestOf("Kept essay", "Craft", "Kept."));
  await settled(context.request, kept.body.item.id, 180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(choice(page, "Topic", "Reading").locator(".fl-n")).toHaveText("1");
  await expect(choice(page, "Tags", "Craft").locator(".fl-n")).toHaveText("1");

  let loads = 0;

  page.on("load", () => {
    loads += 1;
  });

  const late = `${ESSAY}?v=published`;

  const [id = 0] = await pasteBehindDeferredFetch(screen, async () => {
    const pasted = await pasteForId(page, late);
    await expectRows(page, [kept.body.item.id, pasted]);

    const refreshed = await postLinkRaw(context.request, late, {
      ...digestOf("Late essay", "Latetag", "Late."),
      topic: "Latetopic",
    });

    expect(refreshed.status).toBe(200);

    return [pasted];
  });

  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 150_000 });
  await expect(choice(page, "Topic", "Latetopic").locator(".fl-n")).toHaveText("1");
  await expect(choice(page, "Tags", "Latetag").locator(".fl-n")).toHaveText("1");
  await expectRows(page, [kept.body.item.id, id]);
  expect(loads).toBe(0);
});

test("a list read that began before a Paste never erases the pasted row or its count", async () => {
  const { page, context } = screen;
  const kept = await postLinkRaw(context.request, ESSAY, digestOf("Kept essay", "Craft", "Kept."));
  await settled(context.request, kept.body.item.id, 180_000);
  await page.goto("/");
  await choice(page, "Source", "Article").click();
  await expectRows(page, [kept.body.item.id]);

  const before = await holdRead(page, (url) => !url.searchParams.has("source"));
  await page.getByRole("button", { name: "Clear filters" }).click();
  await before.reached;

  const id = await pasteForId(page, `${ESSAY}?v=during`);
  await expectRows(page, [kept.body.item.id, id]);
  await expect(head(page)).toHaveText("2 items, 2 unread");

  before.release();
  await before.delivered;
  await expectRows(page, [kept.body.item.id, id]);
  await expect(head(page)).toHaveText("2 items, 2 unread");
  await expect(choice(page, "Source", "Article").locator(".fl-n")).toHaveText("2");
});
