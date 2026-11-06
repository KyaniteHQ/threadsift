import { type Locator, type Page, expect, test } from "@playwright/test";

import { UNREACHABLE, cardTitle, openLibrary, pasteForId, seed, unreachableUrl } from "./card.ts";
import { STALLED } from "./ingest.ts";
import { newRunId, pasteCard, rowOf } from "./links.ts";

const LONG_PATH = "segment-".repeat(30);

function linesOf(text: Locator): Promise<number> {
  return text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.firstChild ?? element);

    return new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size;
  });
}

async function expectOneEllipsedLine(page: Page, id: number, shown: string): Promise<void> {
  const row = rowOf(page, id);
  const title = row.locator(".it-title");

  await expect(row.locator(".it-open")).toContainText(shown);
  await expect(row.getByRole("link", { name: shown })).toBeVisible();
  expect(await linesOf(row.locator(".it-open")), "the row's link lines").toBe(1);
  expect(await title.evaluate((element) => getComputedStyle(element).textOverflow)).toBe(
    "ellipsis",
  );
  expect(
    await title.evaluate((element) => element.scrollWidth > element.clientWidth),
    "the link is longer than the row, so the ellipsis shows",
  ).toBe(true);
}

for (const width of [390, 1440]) {
  test(`a row's link that stands in for a title is one line with an end ellipsis at ${width} px, and the card keeps it wrapped`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const run = newRunId();
    await seed(page, request, run);
    await openLibrary(page, width);

    const failedUrl = `${unreachableUrl(run)}${LONG_PATH}`;
    const failedShown = failedUrl.replace(/^https:\/\//u, "");
    const failed = await pasteForId(page, failedUrl);
    await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
    await pasteCard(page).hover();

    await expect(pasteCard(page).locator(".ps-url")).toHaveText(failedShown);
    expect(
      await linesOf(pasteCard(page).locator(".ps-url")),
      "the card's link lines",
    ).toBeGreaterThan(1);
    await expect(rowOf(page, failed).locator(".it-fail")).toBeVisible();
    await expectOneEllipsedLine(page, failed, failedShown);

    const stalledUrl = `${STALLED}${LONG_PATH}?run=${run}`;
    const processing = await pasteForId(page, stalledUrl);
    await expect(rowOf(page, processing).locator(".skel i")).toBeVisible();
    await expectOneEllipsedLine(page, processing, stalledUrl.replace(/^http:\/\//u, ""));
  });
}
