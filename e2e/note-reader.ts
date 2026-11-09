import { type Locator, type Page, type Route, expect } from "@playwright/test";

import {
  NOTE_KEEP_MINE,
  NOTE_NEWER_LABEL,
  NOTE_SAVE,
  NOTE_TITLE,
  NOTE_USE_NEWER,
} from "../web/src/reader-text.ts";

export function noteBox(page: Page): Locator {
  return page.locator(".rd-nt");
}

export function noteField(page: Page): Locator {
  return noteBox(page).getByRole("textbox", { name: NOTE_TITLE });
}

export function saveButton(page: Page): Locator {
  return noteBox(page).getByRole("button", { name: NOTE_SAVE, exact: true });
}

export function newerBlock(page: Page): Locator {
  return noteBox(page).getByRole("blockquote", { name: NOTE_NEWER_LABEL });
}

export function keepMine(page: Page): Locator {
  return noteBox(page).getByRole("button", { name: NOTE_KEEP_MINE });
}

export function takeNewer(page: Page): Locator {
  return noteBox(page).getByRole("button", { name: NOTE_USE_NEWER });
}

export function status(page: Page): Locator {
  return noteBox(page).locator("output");
}

export function alerts(page: Page): Locator {
  return noteBox(page).getByRole("alert");
}

export async function expectSaveEnabled(page: Page, enabled: boolean): Promise<void> {
  await expect(saveButton(page)).toHaveAttribute("aria-disabled", enabled ? "false" : "true");
}

export async function write(page: Page, text: string): Promise<void> {
  await noteField(page).fill(text);
}

export async function writeAndSave(page: Page, text: string): Promise<void> {
  await write(page, text);
  await expectSaveEnabled(page, true);
  await saveButton(page).click();
}

export interface Held {
  readonly release: () => Promise<void>;
}

export async function holdNoteAnswers(page: Page, itemId: number, held: Held[]): Promise<void> {
  await page.route(`**/api/items/${itemId}/note`, async (route: Route) => {
    const response = await route.fetch();

    held.push({ release: () => route.fulfill({ response }) });
  });
}

export async function holdNoteRequests(page: Page, itemId: number, held: Held[]): Promise<void> {
  await page.route(`**/api/items/${itemId}/note`, (route: Route) => {
    held.push({
      release: async () => {
        await route.fulfill({ response: await route.fetch() });
      },
    });

    return Promise.resolve();
  });
}
