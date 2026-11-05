import { expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { REFRESHED, cardTitle, openLibrary, pasteOnly } from "./card.ts";
import { addButton, newRunId, pasteCard } from "./links.ts";
import { afterTwoFrames } from "./look.ts";

for (const width of [390, 760, 1440]) {
  test(`the card floats over the list at ${width} px: the first row stays where it was`, async ({
    page,
    request,
  }) => {
    const run = newRunId();
    const { body } = await postLink(request, `https://example.com/${run}/floats`);
    await openLibrary(page, width);
    await afterTwoFrames(page);

    const firstTop = () =>
      page
        .locator("article.it")
        .first()
        .evaluate((row) => Math.round(row.getBoundingClientRect().top));

    const before = await firstTop();
    await pasteOnly(page, body.item.originalUrl);
    await expect(pasteCard(page)).toBeVisible();
    await expect(cardTitle(page)).toHaveText(REFRESHED);

    expect(await firstTop(), "while the card shows").toBe(before);

    const lifted = await pasteCard(page).evaluate((card) => {
      const style = getComputedStyle(card);

      return { position: style.position, shadow: style.boxShadow };
    });

    expect(lifted.position).toBe("absolute");
    expect(lifted.shadow).not.toBe("none");

    await page.keyboard.press("Escape");
    await expect(pasteCard(page)).toBeHidden();
    expect(await firstTop(), "after the card closes").toBe(before);
  });
}

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
