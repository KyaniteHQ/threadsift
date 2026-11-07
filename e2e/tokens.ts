import { type Page, expect } from "@playwright/test";

import { SETTINGS } from "../web/src/access-text.ts";
import { filled } from "../web/src/text.ts";
import { tokenNameField } from "./setup-screens.ts";

export function createButton(page: Page) {
  return page.getByRole("button", { name: SETTINGS.createToken });
}

export function valueField(page: Page) {
  return page.getByRole("textbox", { name: SETTINGS.tokenValue });
}

export async function mint(page: Page, name: string): Promise<void> {
  await tokenNameField(page).fill(name);
  await createButton(page).click();
  await expect(valueField(page)).toBeVisible();
}

export async function addToken(page: Page, name: string): Promise<void> {
  await mint(page, name);
  await page.getByRole("button", { name: SETTINGS.done }).click();
}

export function revokeOf(page: Page, name: string) {
  return page.getByRole("button", {
    name: filled(SETTINGS.revokeNamed, { name }),
    exact: true,
  });
}
