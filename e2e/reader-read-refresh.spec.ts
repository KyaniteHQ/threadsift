import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ESSAY } from "./articles.ts";
import { agentHeaders, sendDigest } from "./catalog.ts";
import { choice, head } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { openLibrary, readStateOf, row, seedRows } from "./reader.ts";
import { digestOf } from "./search.ts";

let screen: FreshScreen;

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  seedRows(screen, [
    { url: "https://example.com/one", title: "Rain on the roof" },
    { url: "https://example.com/two", title: "Wind in the chimney" },
    { url: "https://example.com/three", title: "Snow on the sill", read: true },
    { url: "https://example.com/four", title: "Fog over the fields" },
  ]);
});

test.afterEach(async () => {
  await screen.close();
});

test("a Read state survives a real Paste refresh and the Digest that follows, also when it changes while the Item is processing", async () => {
  test.setTimeout(240_000);
  const { page, context } = screen;
  const headers = await agentHeaders(screen);
  const saved = await sendDigest(screen, ESSAY, { tags: ["Craft"], headers });
  await openLibrary(page, DESKTOP.width, "/", 5);
  await expect(head(page)).toHaveText("5 items, 4 unread");

  await row(page, saved.id).locator(".it-dot").click();
  await expect(head(page)).toHaveText("5 items, 3 unread");
  expect(await readStateOf(page, saved.id)).toBe("read");

  const refreshedTitle = "Refreshed by a caller";
  const digest = digestOf(refreshedTitle, "Craft", "The refresh brings its own Digest.");
  const refresh = await postLinkRaw(context.request, ESSAY, digest, headers);
  expect(refresh.body.item.id).toBe(saved.id);

  for (const readState of ["unread", "read"] as const) {
    const put = await context.request.put(`/api/items/${saved.id}/read-state`, {
      data: { readState },
    });

    expect(put.status()).toBe(200);
  }

  const done = await settled(context.request, saved.id);
  expect(done.digestTitle).toBe(refreshedTitle);
  expect(done.digestOutcome).toBe("none");
  expect(done.fetchedAt, "the refresh fetched the page again").toBeGreaterThan(
    saved.fetchedAt ?? 0,
  );
  expect(done.readState).toBe("read");

  await page.reload();
  await expect(row(page, saved.id)).not.toHaveClass(/\bunread\b/u);
  await expect(row(page, saved.id)).toContainText(refreshedTitle);
  await expect(head(page)).toHaveText("5 items, 3 unread");
  await expect(choice(page, "Read state", "Read")).toContainText("2");
  expect(await readStateOf(page, saved.id)).toBe("read");
});
