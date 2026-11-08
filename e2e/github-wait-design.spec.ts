import { type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { WAITING, filled } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { cardTitle, pasteOnly } from "./card.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { WAIT_MS, startCooldown, whenAt } from "./github-wait.ts";
import { viewportAt, storeSettings } from "./look.ts";
import { paragraphs, reader, row, seedRows } from "./reader.ts";

const KEPT = "https://github.com/example/kept-while-waiting";
const NEW = "https://github.com/example/new-while-waiting";

let screen: FreshScreen;
let keptId: number;
let newId: number;
let until: number;

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  [keptId = 0] = seedRows(screen, [
    {
      url: KEPT,
      title: "example/kept-while-waiting",
      source: "github",
      kind: "github-repo",
      author: "example",
      postText: `# Kept\n\n${paragraphs(4, "README")}`,
      fetchResult: "ok",
    },
  ]);
  screen.fresh.sql(
    `INSERT INTO github_repos (item_id, description, stars, language, license, topics, pushed_at) VALUES (${keptId}, 'Kept from the last good fetch', 42, 'Go', 'MIT', '[]', NULL)`,
  );
  until = Date.now() + WAIT_MS;
  startCooldown(screen.fresh, until);

  for (const url of [KEPT, NEW]) {
    const saved = await screen.context.request.post("/api/items", { data: { url } });

    expect([200, 201]).toContain(saved.status());
  }

  const [item] = screen.fresh.query(
    `SELECT id FROM items WHERE normalized_url = '${NEW}'`,
    z.array(z.object({ id: z.number() })),
  );

  newId = item?.id ?? 0;
});

test.afterAll(async () => {
  await screen.close();
});

async function attachShot(page: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path });
  await test.info().attach(name, { path, contentType: "image/png" });
}

async function sentence(page: Page): Promise<string> {
  return filled(WAITING.until, { when: await whenAt(page, until) });
}

test("the list, the row and the paste card of waiting Items break no design rule in Light, Dark and Sepia at 390, 600, 1440 and 1920 px", async () => {
  const { page } = screen;

  for (const theme of THEMES) {
    for (const [width, bands] of BANDS_AT_WIDTH) {
      await viewportAt(page, width);
      await storeSettings(page, { theme }, "/");
      await pasteOnly(page, NEW);
      await expect(cardTitle(page)).toHaveText(WAITING.title);
      await resize(page, width, bands);

      const text = await sentence(page);

      await expect(page.locator(".paste .ps")).toContainText(text);
      await expect(row(page, keptId).locator(".it-fail")).toHaveText(text);
      await expect(row(page, newId).locator(".it-fail")).toHaveText(text);
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `list with waiting Items, ${theme} at ${width}px`);
      await attachShot(page, `list-waiting-${theme}-${width}`);
    }
  }
});

test("the Reader of a waiting Item breaks no design rule in Light, Dark and Sepia at 390, 600, 1440 and 1920 px", async () => {
  const { page } = screen;

  for (const [id, name] of [
    [keptId, "an Item that keeps its README"],
    [newId, "an Item with no content yet"],
  ] as const) {
    for (const theme of THEMES) {
      for (const [width, bands] of BANDS_AT_WIDTH) {
        await viewportAt(page, width);
        await storeSettings(page, { theme }, `/items/${id}`);
        await expect(reader(page)).toBeVisible();
        await resize(page, width, bands);
        await expect(reader(page).locator(".rd-note").first()).toHaveText(await sentence(page));
        await page.evaluate(() => document.fonts.ready);
        await expectNoViolations(page, `Reader of ${name}, ${theme} at ${width}px`);
        await attachShot(page, `reader-waiting-${id}-${theme}-${width}`);
      }
    }
  }
});
