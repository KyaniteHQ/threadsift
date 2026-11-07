import { type Locator, type Page, expect, test } from "@playwright/test";

import {
  FOLD_HIDE,
  FOOTNOTES_LABEL,
  FOOTNOTE_BACK,
  FOOTNOTE_BACK_AGAIN,
  foldShowLabel,
} from "../web/src/reader-text.ts";
import { filled } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { choice } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { openLibrary, openRow, reader, rewritePostText, seedRows } from "./reader.ts";

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

test("a refresh that lengthens or shortens a code block on an open Item adds or drops its fold", async () => {
  const { page } = screen;

  const [refreshed = 0] = seedRows(screen, [
    {
      url: "https://example.com/refreshed",
      title: "Refreshed",
      postText: `Before.\n\n${codeBlock(SHORT_LINES)}\n\nAfter.`,
      savedAt: Date.now(),
    },
  ]);

  await openLibrary(page, 1440, `/items/${refreshed}`, 2);
  const block = page.locator(".md .code");
  await expect(block).toHaveCount(1);
  await expect(block).toContainText(`line ${SHORT_LINES}:`);
  await expect(block.getByRole("button")).toHaveCount(0);

  rewritePostText(screen, refreshed, `Before.\n\n${codeBlock(FOLD_LINES)}\n\nAfter.`);
  await choice(page, "Read state", "Unread").click();
  await expect(block).toContainText(`line ${FOLD_LINES}:`);
  await expect(block).toHaveClass(/\bfolded\b/u);
  await expect(block.getByRole("button")).toHaveText(foldShowLabel(FOLD_LINES));

  rewritePostText(screen, refreshed, `Before.\n\n${codeBlock(SHORT_LINES)}\n\nAfter.`);
  await choice(page, "Read state", "All").click();
  await expect(block).not.toContainText(`line ${FOLD_LINES}:`);
  await expect(block).not.toHaveClass(/\bfolded\b/u);
  await expect(block.getByRole("button")).toHaveCount(0);
});

test("a footnote reference and its back link stay in the Reader, keep their generated ids, and an outside link opens a new tab", async () => {
  const { page, context } = screen;

  const [noted = 0] = seedRows(screen, [
    {
      url: "https://example.com/noted",
      title: "Noted",
      postText:
        "A claim that needs a source.[^1] See [the site](https://example.com/outside). It is cited again.[^1]\n\nMore text between.\n\n[^1]: The source of the claim.",
      savedAt: Date.now(),
    },
  ]);

  await openLibrary(page, 1440, `/items/${noted}`, 2);
  const reference = page.locator(".md a[data-footnote-ref]").first();
  await expect(reference).toHaveAttribute("id", "user-content-fnref-1");
  await expect(reference).not.toHaveAttribute("target", /./u);
  await expect(page.locator(".md #footnote-label")).toHaveClass(/\bvh\b/u);
  await expect(page.locator(".md #footnote-label")).toHaveText(FOOTNOTES_LABEL);
  await expect(page.locator(".md a", { hasText: "the site" })).toHaveAttribute("target", "_blank");

  const opened: string[] = [];

  context.on("page", (tab) => {
    opened.push(tab.url());
  });

  await reference.click();
  await expect(page).toHaveURL(new RegExp(`/items/${noted}#user-content-fn-1$`, "u"));
  await expect(page.locator("#user-content-fn-1")).toContainText("The source of the claim.");
  await expect(page.locator("#user-content-fn-1")).toBeInViewport();

  const first = filled(FOOTNOTE_BACK, { reference: "1" });
  const again = filled(FOOTNOTE_BACK_AGAIN, { reference: "1", again: "2" });

  await expect(page.locator("#user-content-fn-1 a[data-footnote-backref]")).toHaveCount(2);
  await expect(page.getByRole("link", { name: again })).toBeVisible();
  await page.getByRole("link", { name: first }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${noted}#user-content-fnref-1$`, "u"));
  await expect(reference).toBeInViewport();
  await expect(reader(page)).toBeVisible();
  expect(opened, "tabs opened by the footnote links").toEqual([]);
});
