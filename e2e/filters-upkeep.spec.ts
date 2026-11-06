import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { ADDED, READING, cardTitle, pasteForId } from "./card.ts";
import { choice, expectRows, group } from "./filters.ts";
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
