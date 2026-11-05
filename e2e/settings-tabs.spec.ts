import { expect, test } from "@playwright/test";

import { app, openPanel, pickOption, seedItems, storedSettings } from "./look.ts";

test("a change made in a second tab reaches the first without a reload and is not overwritten", async ({
  page,
  context,
}) => {
  await seedItems(page);
  await page.goto("/");
  await expect(app(page)).toHaveAttribute("data-theme", "light");

  const other = await context.newPage();
  await other.goto("/");
  await pickOption(await openPanel(other), "Theme", "Sepia");

  await expect(app(page)).toHaveAttribute("data-theme", "sepia");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");

  await pickOption(await openPanel(page), "Text size", "Large");
  const stored = await storedSettings(page);
  expect(stored?.["theme"], "the first tab kept the second tab's Theme").toBe("sepia");
  expect(stored?.["size"], "and wrote its own change").toBe("large");
  await other.close();
});
