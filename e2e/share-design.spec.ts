import { expect, test } from "@playwright/test";

import { NOTICES } from "../web/src/text.ts";
import { ADDED, cardTitle } from "./card.ts";
import { THEMES, checkAtEveryWidth } from "./design-screens.ts";
import { dismissButton, newRunId, pasteCard, pasteField } from "./links.ts";
import { app, storeSettings } from "./look.ts";
import { shareFromThisPage } from "./share.ts";

for (const theme of THEMES) {
  test(`the states a share leaves in the paste box pass the design checks at four widths in the ${theme} theme`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const run = newRunId();
    const link = `https://example.com/${run}/design`;
    await storeSettings(page, { theme });
    await expect(app(page)).toHaveAttribute("data-theme", theme);

    await shareFromThisPage(page, { text: "just some words, no link" });
    await expect(pasteCard(page)).toContainText(NOTICES.invalid.text);
    await expect(pasteField(page)).toHaveValue("just some words, no link");
    await checkAtEveryWidth(page, `invalid-link state after a share, ${theme}`);

    await page.goto(`/share?text=${encodeURIComponent(`See ${link}`)}`);
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(pasteField(page)).toHaveValue(link);
    await expect(pasteCard(page)).toHaveCount(0);
    await checkAtEveryWidth(page, `prefilled paste box, ${theme}`);

    await shareFromThisPage(page, { url: link });
    await pasteCard(page).hover();
    await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 30_000 });
    await dismissButton(page).focus();
    await checkAtEveryWidth(page, `shared card, ${theme}`);
  });
}
