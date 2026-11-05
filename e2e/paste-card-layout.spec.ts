import { expect, test } from "@playwright/test";

import { NOTICES } from "../web/src/text.ts";
import { postLink } from "./api.ts";
import {
  READING,
  REFRESHED,
  SLOW_PAGE,
  UNREACHABLE,
  cardTitle,
  openLibrary,
  pasteOnly,
  rowsUnderCard,
  unreachableUrl,
} from "./card.ts";
import { addButton, dismissButton, newRunId, pasteField, retryButton } from "./links.ts";
import { afterTwoFrames } from "./look.ts";

const WIDTHS = [390, 760, 1080, 1440, 1920] as const;

for (const width of WIDTHS) {
  test(`at ${width} px the card covers no list row in any state${width >= 1080 ? " and the first row stays where it was" : ""}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const run = newRunId();
    const { body } = await postLink(request, `https://example.com/${run}/known`);
    await openLibrary(page, width);
    await afterTwoFrames(page);

    const firstTop = () =>
      page
        .locator("article.it")
        .first()
        .evaluate((row) => Math.round(row.getBoundingClientRect().top));

    const before = await firstTop();

    const states: readonly (readonly [string, string, string])[] = [
      ["input error", "not a url", NOTICES.invalid.text],
      ["refreshed", body.item.originalUrl, REFRESHED],
      ["Reading the link", `${SLOW_PAGE}?run=${run}`, READING],
      ["failure", unreachableUrl(run), UNREACHABLE],
    ];

    for (const [state, url, title] of states) {
      await pasteOnly(page, url);
      await expect(cardTitle(page)).toHaveText(title, { timeout: 30_000 });

      expect(await rowsUnderCard(page), `${state}: rows under the card`).toBe(0);

      if (width >= 1080) {
        expect(await firstTop(), `${state}: the first row's top`).toBe(before);
      }
    }
  });
}

test("in a window shorter than the card the sidebar scrolls and the card's buttons stay reachable", async ({
  page,
  request,
}) => {
  await postLink(request, `https://example.com/${newRunId()}/short-window`);
  await page.setViewportSize({ width: 1200, height: 240 });
  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();

  await pasteOnly(page, unreachableUrl(newRunId()));
  await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });

  const scrolls = await page
    .locator(".mast")
    .evaluate((mast) => mast.scrollHeight > mast.clientHeight);

  expect(scrolls).toBe(true);
  await dismissButton(page).scrollIntoViewIfNeeded();
  await expect(dismissButton(page)).toBeInViewport({ ratio: 1 });
  await expect(retryButton(page)).toBeVisible();
});

for (const width of [1080, 1440]) {
  test(`at ${width} px the paste field is as wide as the sidebar's content box, with Add under it`, async ({
    page,
    request,
  }) => {
    await postLink(request, `https://example.com/${newRunId()}/width`);
    await openLibrary(page, width);

    const sizes = await page.evaluate(() => {
      const mast = document.querySelector(".mast");
      const field = document.querySelector(".paste-row .field");
      const add = document.querySelector(".paste-row button");

      if (mast === null || field === null || add === null) {
        throw new Error("the paste box is missing");
      }

      const style = getComputedStyle(mast);

      const padding =
        Number(style.paddingLeft.slice(0, -2)) + Number(style.paddingRight.slice(0, -2));

      const content = mast.clientWidth - padding;

      return {
        content,
        field: field.getBoundingClientRect().width,
        fieldBottom: field.getBoundingClientRect().bottom,
        addTop: add.getBoundingClientRect().top,
      };
    });

    expect(sizes.field).toBeCloseTo(sizes.content, 0);
    expect(sizes.addTop).toBeGreaterThanOrEqual(sizes.fieldBottom);
    await expect(addButton(page)).toBeVisible();
  });
}
