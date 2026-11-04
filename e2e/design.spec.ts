import { expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { collectViolations } from "./design-checks.ts";
import { newRunId } from "./links.ts";

const BANDS_AT_WIDTH = [
  [390, "phone narrow medium wide full"],
  [600, "narrow medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

const THEMES = ["light", "dark", "sepia"];

test("the page keeps the design checks at four widths in three themes", async ({
  page,
}, testInfo) => {
  const run = newRunId();
  const seeded = [];
  const paths = ["a".repeat(300), "short", "docs/guide?id=alpha&page=2", "x", "y", "z"];

  for (const path of paths) {
    seeded.push(await postLink(page.request, `https://example.com/${run}/${path}`));
  }

  await page.goto(seeded[0]?.body.url ?? "/");
  await expect(page.locator(".it.open")).toBeVisible();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  for (const [width, bands] of BANDS_AT_WIDTH) {
    await page.setViewportSize({ width, height: 900 });

    for (const theme of THEMES) {
      await page.locator(".app").evaluate((app, value) => {
        app.dataset["theme"] = value;
      }, theme);
      await expect(page.locator(".app")).toHaveAttribute("data-bp", bands);
      expect(await page.evaluate(collectViolations), `${theme} at ${width}px`).toEqual([]);
      await testInfo.attach(`${theme}-${width}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  }
});
