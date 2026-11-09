import { expect, test } from "@playwright/test";

import { KEPT_ANNOUNCEMENT, REMOVED_ANNOUNCEMENT, REMOVE_LABEL } from "../web/src/reader-text.ts";
import { itemOf } from "./api.ts";
import {
  doubleClickWord,
  dragOver,
  extendByKeys,
  keepButton,
  listEntries,
  markedText,
  marks,
  openReader,
  popover,
  removeButton,
  seedThread,
  selectedText,
} from "./highlight-reader.ts";
import {
  COMMENT_PHRASE,
  POST_PHRASE,
  keepThroughApi,
  thread,
  screenForFile,
} from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

test("a passage kept by mouse in the post text and one kept by keyboard in a Kept comment are saved and marked after a reload", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("a"));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const shortComment = reader(page).locator(".md").nth(2);

  await dragOver(page, body, POST_PHRASE);
  await expect(keepButton(page)).toBeVisible();
  await expect(keepButton(page)).not.toBeFocused();
  await keepButton(page).click();
  await expect(popover(page)).toBeHidden();
  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
  await expect(page.getByText(KEPT_ANNOUNCEMENT)).toBeAttached();

  await doubleClickWord(page, shortComment, "useful");
  await extendByKeys(page, COMMENT_PHRASE.length - "useful".length);
  expect(await selectedText(page)).toBe(COMMENT_PHRASE);
  await expect(keepButton(page)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(keepButton(page)).toBeFocused();
  await page.keyboard.press("m");
  expect((await itemOf(context.request, id)).readState).toBe("unread");
  await page.keyboard.press("Enter");
  await expect.poll(() => markedText(shortComment)).toBe(COMMENT_PHRASE);

  const saved = (await highlightsOf(context.request, id)).items;
  expect(saved.map(({ selector, status }) => [selector.exact, status])).toEqual([
    [POST_PHRASE, "attached"],
    [COMMENT_PHRASE, "attached"],
  ]);

  await page.reload();
  await expect(reader(page).locator(".md").first()).toBeVisible();
  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
  await expect.poll(() => markedText(shortComment)).toBe(COMMENT_PHRASE);
  await expect(listEntries(page)).toHaveCount(2);
});

test("a Highlight is removed from its mark and another from the list by keyboard", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("g"));
  await keepThroughApi(screenOf(), id, [
    ["post", POST_PHRASE],
    ["t1_c2", COMMENT_PHRASE],
  ]);
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  await expect(listEntries(page)).toHaveCount(2);

  await marks(body).first().click();
  await expect(removeButton(page)).toBeVisible();
  await removeButton(page).click();
  await expect(marks(body)).toHaveCount(0);
  await expect(page.getByText(REMOVED_ANNOUNCEMENT)).toBeAttached();
  await expect(listEntries(page)).toHaveCount(1);

  await listEntries(page).first().getByRole("button", { name: REMOVE_LABEL }).focus();
  await page.keyboard.press("Enter");
  await expect(listEntries(page)).toHaveCount(0);
  await expect(marks(reader(page))).toHaveCount(0);
  expect((await highlightsOf(context.request, id)).items).toEqual([]);
});

test("Escape closes the Keep panel and leaves the Reader and the selection, and Copy copies the selected text", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("b"));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  await dragOver(page, body, POST_PHRASE);
  await expect(keepButton(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await expect(reader(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${id}$`, "u"));
  expect(await selectedText(page)).toBe(POST_PHRASE);

  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(POST_PHRASE);
  expect((await highlightsOf(context.request, id)).items).toEqual([]);
});
