import { expect, test } from "@playwright/test";
import { z } from "zod";

import { RETRY_LABEL, SAVING_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { pasteOnly } from "./card.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { DESKTOP } from "./look.ts";
import { openLibrary, row, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

const Posted = z.object({ url: z.string() });

test("Try again pressed on three rows during one save sends all three after it", async () => {
  const { page } = screen;
  const urls = ["a", "b", "c"].map((name) => `https://example.com/failed-${name}`);

  const ids = seedRows(
    screen,
    urls.map((url) => ({ url, title: url, fetchResult: "network" })),
  );

  screen.fresh.sql("UPDATE items SET status = 'failed', reason = 'network'");

  const restore = deferJobs(screen.fresh, "fetch");
  const posted: string[] = [];
  const mayAnswer = Promise.withResolvers<void>();

  try {
    await openLibrary(page, DESKTOP.width, "/", 3);

    await page.route(/\/api\/items$/u, async (route) => {
      if (route.request().method() === "POST") {
        posted.push(Posted.parse(route.request().postDataJSON()).url);

        if (posted.length === 1) await mayAnswer.promise;
      }

      await route.continue();
    });

    await pasteOnly(page, "https://example.com/slow-save");
    await expect(page.getByRole("button", { name: SAVING_LABEL })).toBeDisabled();

    for (const id of ids) {
      await row(page, id).getByRole("button", { name: RETRY_LABEL }).click();
    }

    mayAnswer.resolve();
    await expect.poll(() => posted.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    expect(posted.toSorted()).toEqual(["https://example.com/slow-save", ...urls].toSorted());
  } finally {
    restore();
  }
});
