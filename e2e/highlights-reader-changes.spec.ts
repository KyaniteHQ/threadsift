import { expect, test } from "@playwright/test";

import {
  KEEP_FAILED,
  KEEP_STALE,
  NOT_FOUND,
  REMOVE_FAILED,
  REMOVE_LABEL,
} from "../web/src/reader-text.ts";
import {
  dragOver,
  keepButton,
  listEntries,
  markedText,
  marks,
  openReader,
  seedThread,
} from "./highlight-reader.ts";
import {
  POST_PHRASE,
  POST_TEXT,
  keepThroughApi,
  thread,
  screenForFile,
} from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

test("a refresh that removes one quote lists it as no longer found, keeps the other marked, and its Remove works", async () => {
  const { page, context } = screenOf();
  const tag = "c";
  const id = await seedThread(screenOf(), thread(tag));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  for (const phrase of [POST_PHRASE, "fallback folder is cleared"]) {
    await dragOver(page, body, phrase);
    await keepButton(page).click();
    await expect.poll(() => markedText(body)).toContain(phrase.slice(0, 12));
  }

  await expect(listEntries(page)).toHaveCount(2);

  await seedThread(
    screenOf(),
    thread(
      tag,
      POST_TEXT.replace("fallback folder is cleared on reboot", "temp folder empties itself"),
    ),
  );
  await page.reload();
  await expect(reader(page).locator(".md").first()).toBeVisible();

  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
  await expect(listEntries(page)).toHaveCount(2);
  const gone = listEntries(page).filter({ hasText: NOT_FOUND });
  await expect(gone).toHaveCount(1);
  await expect(gone).toContainText("fallback folder is cleared");
  await expect(gone.locator("button.hl-quote")).toHaveCount(0);

  await gone.getByRole("button", { name: REMOVE_LABEL }).click();
  await expect(listEntries(page)).toHaveCount(1);
  expect((await highlightsOf(context.request, id)).items.map((h) => h.selector.exact)).toEqual([
    POST_PHRASE,
  ]);
});

test("choosing a list entry opens the folded comment or code block that holds its passage and focuses the mark", async () => {
  const { page } = screenOf();
  const id = await seedThread(screenOf(), thread("d"));
  await keepThroughApi(screenOf(), id, [
    ["t1_c1", "tmpfs fixed it"],
    ["t1_c3", "echo step 28"],
  ]);

  await openReader(page, id, DESKTOP.width);
  await expect(listEntries(page)).toHaveCount(2);
  const folded = reader(page).locator(".cm-fold").first();
  const code = reader(page).locator(".code");
  await expect(folded).toHaveClass(/folded/u);
  await expect(code).toHaveClass(/folded/u);

  await listEntries(page).nth(0).locator("button.hl-quote").click();
  await expect(folded).not.toHaveClass(/folded/u);
  await expect(marks(folded)).toBeFocused();
  await expect(marks(folded)).toBeInViewport();

  await listEntries(page).nth(1).locator("button.hl-quote").click();
  await expect(code).not.toHaveClass(/folded/u);
  await expect(marks(code)).toBeFocused();
  await expect(marks(code)).toBeInViewport();
  expect(await markedText(code)).toBe("echo step 28");
});

test("a keep that meets text changed by a refresh says so, saves nothing, and works again on the new text", async () => {
  const { page, context } = screenOf();
  const tag = "e";
  const id = await seedThread(screenOf(), thread(tag));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  await dragOver(page, body, "cache path before");
  await expect(keepButton(page)).toBeVisible();
  await seedThread(
    screenOf(),
    thread(tag, `${POST_TEXT}\n\nA new closing paragraph about the cache path.`),
  );
  await keepButton(page).click();

  await expect(reader(page).getByRole("alert").filter({ hasText: KEEP_STALE })).toBeVisible();
  expect((await highlightsOf(context.request, id)).items).toEqual([]);
  await expect(reader(page).locator(".md").first()).toContainText("A new closing paragraph");

  await dragOver(page, reader(page).locator(".md").first(), "cache path before");
  await keepButton(page).click();
  await expect
    .poll(() => markedText(reader(page).locator(".md").first()))
    .toBe("cache path before");
  await expect(reader(page).getByRole("alert")).toHaveCount(0);
});

test("a keep and a remove that the network drops say so and change nothing", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("f"));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  await page.route(`**/api/items/${id}/highlights`, (route) => route.abort());
  await dragOver(page, body, POST_PHRASE);
  await keepButton(page).click();
  await expect(reader(page).getByRole("alert").filter({ hasText: KEEP_FAILED })).toBeVisible();
  expect((await highlightsOf(context.request, id)).items).toEqual([]);
  await page.unroute(`**/api/items/${id}/highlights`);

  await dragOver(page, body, POST_PHRASE);
  await keepButton(page).click();
  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
  await expect(reader(page).getByRole("alert")).toHaveCount(0);

  await page.route(`**/api/items/${id}/highlights/*`, (route) => route.abort());
  await listEntries(page).getByRole("button", { name: REMOVE_LABEL }).click();
  await expect(reader(page).getByRole("alert").filter({ hasText: REMOVE_FAILED })).toBeVisible();
  await expect(marks(body)).not.toHaveCount(0);
  expect((await highlightsOf(context.request, id)).items).toHaveLength(1);
});
