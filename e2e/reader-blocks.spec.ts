import { type Locator, type Page, expect, test } from "@playwright/test";

import { FOLD_HIDE, foldShowLabel } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { openLibrary, openRow, reader, seedRows } from "./reader.ts";

const LONG_LINE = 400;
const FOLD_LINES = 40;
const SHORT_LINES = 5;

function codeBlock(lines: number): string {
  return [
    "```",
    ...Array.from(
      { length: lines },
      (_, index) => `line ${index + 1}: value = compute(${index + 1})`,
    ),
    "```",
  ].join("\n");
}

const POST_TEXT = [
  "Intro paragraph before the blocks.",
  `\`\`\`\n${"x".repeat(LONG_LINE)}\n\`\`\``,
  [
    "| Name | Where to read it |",
    "|---|---|",
    `| wide | ${"w".repeat(120)} |`,
    "| plain | short |",
  ].join("\n"),
  codeBlock(FOLD_LINES),
  codeBlock(SHORT_LINES),
  "Closing paragraph after the blocks.",
].join("\n\n");

const WIDTHS = [1440, 390] as const;

let screen: FreshScreen;
let id: number;

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  [id = 0] = seedRows(screen, [
    { url: "https://example.com/blocks", title: "Blocks", postText: POST_TEXT },
  ]);
});

test.afterEach(async () => {
  await screen.close();
});

function boxAround(page: Page, content: string): Locator {
  return page.locator(".md .sxw").filter({ has: page.locator(content) });
}

function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

function fadeShowing(box: Locator): Promise<boolean> {
  return box.evaluate((element) => getComputedStyle(element, "::after").content !== "none");
}

function scrollsInsideBlocks(width: number): void {
  test(`at ${width}px a 400-character code line and a wide table scroll inside their blocks with a fade, and the page does not scroll sideways`, async () => {
    const { page } = screen;
    await openLibrary(page, width, `/items/${id}`);
    await expect(reader(page)).toBeVisible();
    const code = boxAround(page, "pre.sx").first();
    const table = boxAround(page, ".tbl");
    await expect(code).toHaveAttribute("data-more", "1");
    await expect(table).toHaveAttribute("data-more", "1");
    expect(await fadeShowing(code), "the code block's fade").toBe(true);
    expect(await fadeShowing(table), "the table's fade").toBe(true);

    for (const [box, scroller] of [
      [code, code.locator(".sx")],
      [table, table.locator(".tbl")],
    ] as const) {
      const sizes = await scroller.evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));

      expect(sizes.scroll, "the block is wider than its box").toBeGreaterThan(sizes.client);

      await scroller.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });

      await expect(box).toHaveAttribute("data-more", "0");
    }

    expect(await pageScrollsSideways(page), "the page scrolls sideways").toBe(false);
    await expect(table.locator(".tbl")).toHaveAttribute("tabindex", "0");
  });
}

for (const width of WIDTHS) {
  scrollsInsideBlocks(width);
}

test("a code block over the fold height folds, and the button unfolds and folds it by mouse and keyboard", async () => {
  const { page } = screen;
  await openLibrary(page, 1440, `/items/${id}`);
  const folding = page.locator(".md .code").filter({ hasText: "line 40:" });

  const short = page
    .locator(".md .code")
    .filter({ hasText: `line ${SHORT_LINES}:` })
    .last();

  const more = folding.getByRole("button");
  await expect(folding).toHaveClass(/\bfolded\b/u);
  await expect(more).toHaveText(foldShowLabel(FOLD_LINES));
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(short.getByRole("button")).toHaveCount(0);

  await more.click();
  await expect(folding).not.toHaveClass(/\bfolded\b/u);
  await expect(more).toHaveText(FOLD_HIDE);
  await expect(more).toHaveAttribute("aria-expanded", "true");

  await more.press("Enter");
  await expect(folding).toHaveClass(/\bfolded\b/u);
  await expect(more).toBeFocused();

  await more.press("Space");
  await expect(folding).not.toHaveClass(/\bfolded\b/u);
  await expect(more).toHaveAttribute("aria-expanded", "true");
});

test("raw HTML in a post text shows as text and creates no script or image element", async () => {
  const { page } = screen;

  const [unsafe = 0] = seedRows(screen, [
    {
      url: "https://example.com/unsafe",
      title: "Unsafe",
      postText:
        'Before <script>window.hacked = 1</script> and <img src="x" onerror="window.hacked = 2"> and <iframe src="https://example.com"></iframe> after.\n\n[a link](javascript:window.hacked=3)',
      savedAt: Date.now(),
    },
  ]);

  const dialogs: string[] = [];

  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
  });

  await openLibrary(page, 1440, "/", 2);
  await openRow(page, unsafe);
  const post = page.locator(".md");
  await expect(post).toContainText("<script>window.hacked = 1</script>");
  await expect(post).toContainText("<img src=");
  await expect(post.locator("script, img, iframe")).toHaveCount(0);
  await expect(reader(page).locator("script, img, iframe, [onerror]")).toHaveCount(0);
  await expect(post.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => "hacked" in window)).toBe(false);
  expect(dialogs).toEqual([]);
});
