import { type Page, expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw } from "./api.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { showGrid } from "./grid.ts";
import { deferJobs, jobsOf } from "./ingest.ts";
import { storeSettings, viewportAt } from "./look.ts";
import { row, seedRows } from "./reader.ts";

let screen: FreshScreen;

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterAll(async () => {
  await screen.close();
});

test("in Grid a titled Item keeps its dashed card edge while a refresh holds it processing, and the edge turns solid when it is ready", async () => {
  const { page } = screen;

  const [refreshed = 0, idle = 0] = seedRows(screen, [
    { url: "https://example.com/refreshed", title: "A titled card being refreshed" },
    { url: "https://example.com/idle", title: "A titled card at rest" },
  ]);

  await viewportAt(page, 1440);
  await showGrid(page, "page");
  await expect(row(page, refreshed)).toHaveCSS("border-top-style", "solid");

  const release = deferJobs(screen.fresh, "fetch");

  try {
    const { body } = await postLinkRaw(screen.context.request, "https://example.com/refreshed");
    expect(body.item.id, "a known link refreshes its Item").toBe(refreshed);
  } finally {
    release();
  }

  expect(jobsOf(refreshed, screen.fresh, "fetch").map((job) => job.state)).toEqual(["queued"]);
  await page.reload();
  await expect(row(page, refreshed).locator(".it-title")).toContainText(
    "A titled card being refreshed",
  );
  await expect(row(page, refreshed).locator(".proc-ic")).toBeVisible();
  await expect(row(page, refreshed)).toHaveCSS("border-top-style", "dashed");
  await expect(row(page, idle)).toHaveCSS("border-top-style", "solid");
  await expectTitleFaceOfIdle(page, refreshed, idle);

  await storeSettings(page, { layout: "list" });
  await expect(row(page, refreshed).locator(".proc-ic")).toBeVisible();
  await expectTitleFaceOfIdle(page, refreshed, idle);

  screen.fresh.sql(`UPDATE items SET status = 'ready' WHERE id = ${refreshed}`);
  await showGrid(page, "page");
  await expect(row(page, refreshed)).toHaveCSS("border-top-style", "solid");
});

async function expectTitleFaceOfIdle(page: Page, processing: number, idle: number): Promise<void> {
  const face = await row(page, idle)
    .locator(".it-open")
    .evaluate((link) => {
      const style = getComputedStyle(link);

      return { size: style.fontSize, family: style.fontFamily };
    });

  await expect(row(page, processing).locator(".it-open")).toHaveCSS("font-size", face.size);
  await expect(row(page, processing).locator(".it-open")).toHaveCSS("font-family", face.family);
}
