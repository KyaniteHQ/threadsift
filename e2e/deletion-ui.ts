import { type Locator, type Page, expect } from "@playwright/test";

import {
  CANCEL_LABEL,
  DELETED,
  DELETE_CONFIRM,
  DELETE_LABEL,
  DELETE_PENDING,
  DELETE_TITLE,
} from "../web/src/reader-text.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { pasteField } from "./links.ts";
import { DESKTOP } from "./look.ts";
import { bar, openLibrary, openRow, reader, row, seedRows } from "./reader.ts";

export const WIDE = DESKTOP.width;

export const PHONE = 390;

export function seedWeather(screen: FreshScreen): readonly number[] {
  return seedRows(screen, [
    { url: "https://example.com/one", title: "Rain on the roof" },
    { url: "https://example.com/two", title: "Wind in the chimney" },
    { url: "https://example.com/three", title: "Snow on the sill", read: true },
    { url: "https://example.com/four", title: "Fog over the fields" },
  ]);
}

export async function openItemAt(page: Page, width: number, id: number, rows = 1): Promise<void> {
  await openLibrary(page, width, "/", rows);
  await openRow(page, id);
}

export async function expectLibraryEmptied(page: Page): Promise<void> {
  await expect(page.locator("article.it")).toHaveCount(0);
  await expect(reader(page)).toHaveCount(0);
  await expect(pasteField(page)).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: DELETED })).toBeAttached();
}

export function deleteButton(page: Page): Locator {
  return bar(page).getByRole("button", { name: DELETE_LABEL, exact: true });
}

export function dialog(page: Page): Locator {
  return page.getByRole("dialog", { name: DELETE_TITLE });
}

export function confirmButton(page: Page): Locator {
  return dialog(page).getByRole("button", {
    name: new RegExp(`^(${DELETE_CONFIRM}|${DELETE_PENDING})`, "u"),
  });
}

export function cancelButton(page: Page): Locator {
  return dialog(page).getByRole("button", { name: CANCEL_LABEL });
}

export async function ask(page: Page): Promise<void> {
  await deleteButton(page).click();
  await expect(dialog(page)).toBeVisible();
}

export async function askAndConfirm(page: Page): Promise<void> {
  await ask(page);
  await confirmButton(page).click();
}

export function titleLink(page: Page, id: number): Locator {
  return row(page, id).locator("a.it-open");
}

export async function holdDelete(page: Page) {
  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();

  await page.route(/\/api\/items\/\d+$/u, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();

      return;
    }

    const response = await route.fetch();
    reached.resolve();
    await gate.promise;
    await route.fulfill({ response });
  });

  return {
    reached: reached.promise,
    release: () => {
      gate.resolve();
    },
  };
}
