import { type Page, expect } from "@playwright/test";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { THREAD_TITLE } from "./reader-items.ts";
import { MOTION_ITEM, motionOf, watchMotion } from "./reader-motion-flow.ts";
import { heldNoteSave, heldPaste, heldSettingPick } from "./restore-hold-flow.ts";
import { savedItem, whileRestoreHolds } from "./saved-item.ts";

export async function readerMotion(page: Page): Promise<void> {
  const id = await savedItem(page.request, MOTION_ITEM);
  const card = page.locator(`.it[data-key="${String(id)}"] .it-open`);
  const shared = [[`lib-item-${String(id)}`]];
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.addInitScript(watchMotion);
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify({ layout: "grid", openAs: "sheet" })] as const,
  );
  await page.goto("/");

  const opened = await motionOf(page, () => card.click(), 1);
  const escaped = await motionOf(page, () => page.keyboard.press("Escape"), 0);
  await motionOf(page, () => card.click(), 1);
  const backed = await motionOf(
    page,
    async () => {
      await page.goBack();
    },
    0,
  );

  expect(
    opened.map((run) => run.moved),
    "the open grows only this Item's card",
  ).toEqual(shared);
  expect(
    escaped.map((run) => run.moved),
    "Escape runs the Reader back into it",
  ).toEqual(shared);
  expect(
    backed.map((run) => run.moved),
    "Back runs the Reader back into it",
  ).toEqual(shared);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await motionOf(page, () => card.click(), 1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-slot")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  expect(
    reduced.map((run) => run.changing),
    "reduced motion animates nothing",
  ).toEqual([0]);

  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    [STORAGE_KEY, stored] as const,
  );
}

export async function refusedWhileRestoreHolds(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: THREAD_TITLE })
    .getByRole("link")
    .first()
    .click();

  await whileRestoreHolds(async () => {
    await heldNoteSave(page);
    await heldPaste(page);
    await heldSettingPick(page);
  });
  await page.goto("/");
}
