import { type Locator, type Page, expect, test } from "@playwright/test";

import { KEPT_ANNOUNCEMENT } from "../web/src/reader-text.ts";
import { sheet, showGrid } from "./grid.ts";
import {
  doubleClickWord,
  dragOver,
  extendByKeys,
  keepButton,
  markedText,
  marks,
  seedThread,
  selectedText,
} from "./highlight-reader.ts";
import { COMMENT_PHRASE, POST_PHRASE, screenForFile, thread } from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

async function shownText(page: Page): Promise<string[]> {
  const session = await page.context().newCDPSession(page);

  try {
    const { nodes } = await session.send("Accessibility.getFullAXTree");

    return nodes.flatMap((node) =>
      !node.ignored && node.role?.value === "StaticText" ? [String(node.name?.value ?? "")] : [],
    );
  } finally {
    await session.detach();
  }
}

const MOST_TABS = 40;

async function tabUntilFocused(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < MOST_TABS; presses += 1) {
    await page.keyboard.press("Tab");

    if (await target.evaluate((element) => element === document.activeElement)) return;
  }

  await expect(target).toBeFocused();
}

for (const openAs of ["page", "sheet"] as const) {
  test(`in Grid ${openAs} a passage selected by keyboard is kept without the arrow keys opening the next Item and the passage is marked`, async () => {
    const { page, context } = screenOf();
    const id = await seedThread(screenOf(), thread(`k${openAs}`));
    await seedThread(screenOf(), thread(`n${openAs}`));
    await showGrid(page, openAs, `/items/${id}`);
    const body = (openAs === "sheet" ? sheet(page) : reader(page)).locator(".md").nth(2);

    await expect(body).toBeVisible();
    await doubleClickWord(page, body, "useful");
    await extendByKeys(page, COMMENT_PHRASE.length - "useful".length);
    await expect(page).toHaveURL(new RegExp(`/items/${id}$`, "u"));
    expect(await selectedText(page)).toBe(COMMENT_PHRASE);
    await expect(keepButton(page)).toBeVisible();
    await tabUntilFocused(page, keepButton(page));
    await page.keyboard.press("Enter");

    await expect.poll(() => markedText(body)).toBe(COMMENT_PHRASE);
    await expect(marks(body)).not.toHaveCount(0);
    expect((await highlightsOf(context.request, id)).items).toHaveLength(1);
  });
}

for (const openAs of ["page", "sheet"] as const) {
  test(`in Grid ${openAs} the announcement of a kept passage is in the accessibility tree`, async () => {
    const { page } = screenOf();
    const id = await seedThread(screenOf(), thread(`a${openAs}`));
    await showGrid(page, openAs, `/items/${id}`);
    const body = (openAs === "sheet" ? sheet(page) : reader(page)).locator(".md").first();

    await expect(body).toBeVisible();
    await dragOver(page, body, POST_PHRASE);
    await keepButton(page).click();

    await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
    await expect.poll(() => shownText(page)).toContain(KEPT_ANNOUNCEMENT);
  });
}
