import { type Locator, type Page, expect, test } from "@playwright/test";

import { COMMENTS_TITLE, SHOW_FULL_COMMENT, SHOW_LESS } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import { comments, openItem } from "./comment-reader.ts";
import { GUIDE_LINK, PREVIEW_LINK, type Seeded, seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP } from "./look.ts";
import { savedBlock, topBlock } from "./reader-place.ts";
import { slot } from "./reader.ts";

test.describe.configure({ timeout: 300_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let ids: Seeded;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = await seedThreads(screen);
});

test.afterAll(async () => {
  await screen.close();
});

function tallCard(page: Page): Locator {
  return comments(page).locator(".cm-card", { hasText: "Kept tall paragraph 1" });
}

test("tabbing into a link or code block below a folded comment's preview opens the comment, and Enter and Space toggle it", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  const card = tallCard(page);
  const fold = card.locator(".cm-fold");
  const toggle = card.locator(".cm-more");
  const link = card.getByRole("link", { name: GUIDE_LINK });

  await expect(fold).toHaveClass(/folded/u);
  await expect(toggle).toHaveText(SHOW_FULL_COMMENT);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await comments(page).getByRole("heading", { name: COMMENTS_TITLE }).focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(fold, "reaching a clipped link opens the comment").not.toHaveClass(/folded/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText(SHOW_LESS);
  expect(
    await fold.evaluate((element) => element.scrollTop),
    "the clipped box did not scroll",
  ).toBe(0);

  await page.keyboard.press("Tab");
  await expect(card.locator("pre[tabindex]")).toBeFocused();

  await expect(toggle).toHaveAttribute("aria-controls", (await fold.getAttribute("id")) ?? "");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(fold).toHaveClass(/folded/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(fold).not.toHaveClass(/folded/u);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(fold).toHaveClass(/folded/u);
  await expect(toggle).toBeFocused();
});

test("pressing the mouse on a link inside a folded preview leaves the comment folded", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  const card = comments(page).locator(".cm-card", { hasText: "Kept long paragraph 1" });
  const link = card.getByRole("link", { name: PREVIEW_LINK });

  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  expect(box, "the link in the preview is on screen").not.toBeNull();
  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await expect(link).toBeFocused();
  await expect(card.locator(".cm-fold")).toHaveClass(/folded/u);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(card.locator(".cm-fold")).toHaveClass(/folded/u);
});

async function edgeBelowFold(page: Page, gap: number): Promise<void> {
  await slot(page).evaluate((element, distance) => {
    const fold = element.querySelector(".cm-fold.folded");
    const barBottom = element.querySelector(".rd-bar")?.getBoundingClientRect().bottom ?? 0;

    if (fold !== null)
      element.scrollTop += fold.getBoundingClientRect().bottom + distance - barBottom;
  }, gap);
}

test("a paragraph that runs past the fold never holds the reading place once its visible part has scrolled away", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  await expect(tallCard(page).locator(".cm-fold")).toHaveClass(/folded/u);

  await edgeBelowFold(page, 20);

  const block = await topBlock(page);
  expect(block, "the first block with visible text under the bar").toContain("Kept three");
  await expect.poll(() => savedBlock(page, ids.thread)).toBe(block);

  await page.reload();
  await expect(comments(page)).toBeVisible();
  await expect.poll(() => topBlock(page)).toBe(block);
});

test("a place deep inside an opened paragraph comes back to the folded comment, not below it", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  const card = tallCard(page);
  await card.getByRole("button", { name: SHOW_FULL_COMMENT }).click();

  await slot(page).evaluate((element) => {
    const paragraph = [...element.querySelectorAll(".cm-card .md > p")].find((candidate) =>
      candidate.textContent.startsWith("Kept tall paragraph 1"),
    );

    const barBottom = element.querySelector(".rd-bar")?.getBoundingClientRect().bottom ?? 0;
    const box = paragraph?.getBoundingClientRect();

    if (box !== undefined) element.scrollTop += box.top + 0.7 * box.height - barBottom;
  });

  const block = await topBlock(page);
  expect(block).toContain("Kept tall paragraph 1");
  await expect.poll(() => savedBlock(page, ids.thread)).toBe(block);

  await page.reload();
  await expect(comments(page)).toBeVisible();
  await expect(card.locator(".cm-fold")).toHaveClass(/folded/u);

  await expect
    .poll(async () => {
      const [top, barBottom] = await slot(page).evaluate((element) => [
        element.querySelector(".cm-fold")?.getBoundingClientRect().top ?? 0,
        element.querySelector(".rd-bar")?.getBoundingClientRect().bottom ?? 0,
      ]);

      return (top ?? 0) - (barBottom ?? 0);
    })
    .toBeGreaterThanOrEqual(-1);
});

test("footnotes of different bodies keep their own ids, references and back links", async () => {
  const page = await openItem(screen, DESKTOP.width, ids.thread);
  await expect(page.locator("a[data-footnote-ref]")).toHaveCount(3);

  const allIds = await page.locator("[id]").evaluateAll((elements) => elements.map((e) => e.id));
  const repeated = allIds.filter((id, index) => id !== "" && allIds.indexOf(id) !== index);
  expect(repeated, "ids used more than once").toEqual([]);

  const links = await page.locator(".md").evaluateAll((bodies) =>
    bodies
      .filter((body) => body.querySelector("a[data-footnote-ref]") !== null)
      .map((body) => {
        const reference = body.querySelector("a[data-footnote-ref]");
        const noteId = decodeURIComponent((reference?.getAttribute("href") ?? "").slice(1));
        const note = document.querySelector(`[id="${noteId}"]`);

        const backHref =
          note?.querySelector("a[data-footnote-backref]")?.getAttribute("href") ?? "";

        const back = document.querySelector(`[id="${decodeURIComponent(backHref.slice(1))}"]`);

        const label = document.querySelector(
          `[id="${reference?.getAttribute("aria-describedby") ?? ""}"]`,
        );

        return {
          note: note?.textContent.trim() ?? "",
          noteInside: note !== null && body.contains(note),
          backIsReference: back === reference,
          labelInside: label !== null && body.contains(label),
        };
      }),
  );

  expect(links.map((entry) => entry.note)).toEqual([
    expect.stringContaining("Footnote of the post."),
    expect.stringContaining("Footnote of three."),
    expect.stringContaining("Footnote of eight."),
  ]);

  for (const entry of links) {
    expect(entry.noteInside, `${entry.note} sits in its own body`).toBe(true);
    expect(entry.backIsReference, `${entry.note} links back to its own reference`).toBe(true);
    expect(entry.labelInside, `${entry.note} is labelled by its own heading`).toBe(true);
  }
});
