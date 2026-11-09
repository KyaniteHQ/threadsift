import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { cardTitle, pasteForId } from "./card.ts";
import { agentHeaders } from "./catalog.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { addButton, pasteCard } from "./links.ts";
import { row } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("a card whose Item was deleted elsewhere is closed, so Escape on the Add button moves nothing", async () => {
  const { page } = screen;
  const restore = deferJobs(screen.fresh, "fetch");

  await page.goto("/");

  let id = 0;

  try {
    id = await pasteForId(page, "https://example.com/card-gone");
  } finally {
    restore();
  }

  await expect(cardTitle(page)).toBeVisible();

  const removed = await screen.context.request.delete(`/api/items/${id}`, {
    headers: await agentHeaders(screen),
  });

  expect(removed.status()).toBe(204);
  await expect(row(page, id)).toHaveCount(0);
  await expect(pasteCard(page)).toBeHidden();

  await addButton(page).focus();
  await page.keyboard.press("Escape");
  await expect(addButton(page)).toBeFocused();
});
