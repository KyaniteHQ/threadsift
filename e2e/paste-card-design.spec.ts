import { type Page, expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import {
  ADDED,
  READING,
  REFRESHED,
  SLOW_PAGE,
  UNREACHABLE,
  cardTitle,
  pasteOnly,
  unreachableUrl,
} from "./card.ts";
import { THEMES, checkAtEveryWidth } from "./design-screens.ts";
import { STALLED } from "./ingest.ts";
import { dismissButton, newRunId, pasteCard } from "./links.ts";
import { app, storeSettings } from "./look.ts";

const WIDTHS = [
  [390, "phone narrow medium wide full"],
  [760, "medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

function checkAtFourWidths(page: Page, what: string): Promise<void> {
  return checkAtEveryWidth(page, what, WIDTHS);
}

async function checkHeld(page: Page, url: string, title: string, what: string): Promise<void> {
  await pasteOnly(page, url);
  await expect(cardTitle(page)).toHaveText(title, { timeout: 30_000 });
  await dismissButton(page).focus();
  await checkAtFourWidths(page, what);
}

for (const theme of THEMES) {
  test(`the paste card passes the design checks in every state at four widths in the ${theme} theme`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const run = newRunId();
    const { body } = await postLink(request, `https://example.com/${run}/known`);
    await storeSettings(page, { theme });
    await expect(page.locator("article.it").first()).toBeVisible();
    await expect(app(page)).toHaveAttribute("data-theme", theme);

    await pasteOnly(page, "not a url");
    await expect(pasteCard(page)).toBeVisible();
    await checkAtFourWidths(page, `input error card, ${theme}`);

    await checkHeld(page, `https://example.com/${run}/added`, ADDED, `Added, ${theme}`);
    await checkHeld(page, body.item.originalUrl, REFRESHED, `refreshed, ${theme}`);
    await checkHeld(page, `${SLOW_PAGE}?run=${run}`, ADDED, `Added with a note, ${theme}`);
    await expect(pasteCard(page)).toContainText("no title");

    await pasteOnly(page, `${STALLED}?run=${run}`);
    await expect(cardTitle(page)).toHaveText(READING);
    await checkAtFourWidths(page, `Reading the link, ${theme}`);

    await pasteOnly(page, unreachableUrl(run));
    await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
    await checkAtFourWidths(page, `failure with Try again, ${theme}`);
  });
}
