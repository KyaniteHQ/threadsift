import { expect, test } from "@playwright/test";

import { FILL_NOTE, NO_POST_TEXT, OPEN_LABELS } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { BANDS_AT_WIDTH, THEMES, expectNoViolations, resize } from "./design-screens.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, attachScreenshot, storeSettings, viewportAt } from "./look.ts";
import { reader, seedRows } from "./reader.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const POST = "https://reddit.com/r/all/comments/rfill1/";
const COMMENT = "https://reddit.com/r/all/comments/rfill2/_/cmt1/";
const FILLED = "https://reddit.com/r/all/comments/rfill3/";
const ARTICLE = "https://example.com/rfill-article";
const WIDTHS = [BANDS_AT_WIDTH[0], BANDS_AT_WIDTH[2]] as const;

let screen: FreshScreen;
let ids: Readonly<Record<"post" | "comment" | "filled" | "article", number>>;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  const [post = 0, comment = 0, filled = 0, article = 0] = seedRows(screen, [
    { url: POST, title: "A post waiting for its thread", source: "reddit", kind: "reddit-post" },
    { url: COMMENT, title: "A comment waiting", source: "reddit", kind: "reddit-comment" },
    {
      url: FILLED,
      title: "A post with its thread",
      source: "reddit",
      kind: "reddit-post",
      postText: "The post text of a filled thread.",
    },
    { url: ARTICLE, title: "An article", source: "article", kind: "article" },
  ]);

  screen.fresh.sql(
    `INSERT INTO reddit_threads (item_id, generation, reported) VALUES (${filled}, 0, 0)`,
  );
  ids = { post, comment, filled, article };
});

test.afterAll(async () => {
  await screen.close();
});

test("the Reader of a Reddit post or comment with no saved thread says opening its thread on Reddit fills it, beside the link that opens it, and no other Reader says so", async () => {
  const { page } = screen;
  await viewportAt(page, DESKTOP.width);

  for (const [name, id, url] of [
    ["post", ids.post, POST],
    ["comment", ids.comment, COMMENT],
  ] as const) {
    await page.goto(`/items/${id}`);
    await expect(reader(page).locator(".rd-note", { hasText: FILL_NOTE })).toBeVisible();

    const open = reader(page).getByRole("link", { name: OPEN_LABELS.reddit, exact: true });

    await expect(open, name).toHaveCount(1);
    await expect(open, name).toHaveAttribute("href", url);
    await expect(open, name).toHaveAttribute("target", "_blank");
    await expect(reader(page), name).not.toContainText(NO_POST_TEXT);
  }

  for (const [name, id] of [
    ["a filled post", ids.filled],
    ["an article", ids.article],
  ] as const) {
    await page.goto(`/items/${id}`);
    await expect(reader(page).locator(".rd-title")).toBeVisible();
    await expect(reader(page), name).not.toContainText(FILL_NOTE);
  }

  await page.goto(`/items/${ids.article}`);
  await expect(reader(page)).toContainText(NO_POST_TEXT);
});

test("the Reader's note on filling the thread breaks no design rule in Light, Dark and Sepia on a phone and a desktop", async () => {
  const { page } = screen;
  const info = test.info();

  for (const theme of THEMES) {
    for (const [width, bands] of WIDTHS) {
      await viewportAt(page, width);
      await storeSettings(page, { theme }, `/items/${ids.post}`);
      await resize(page, width, bands);
      await expect(reader(page).locator(".rd-note", { hasText: FILL_NOTE })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoViolations(page, `the fill offer, ${theme} at ${width}px`);
      await attachScreenshot(page, info, `reader-fill-${theme}-${width}`);
    }
  }
});
