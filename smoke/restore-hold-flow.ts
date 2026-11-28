import { type Page, expect } from "@playwright/test";

import { NOTE_TITLE } from "../src/core/contract/reader-text.ts";
import { SETTINGS } from "../web/src/access-text.ts";
import { NOTE_RESTORING, NOTE_SAVE } from "../web/src/reader-text.ts";
import { REDDIT_TEXT } from "../web/src/reddit-text.ts";
import { ADD_LABEL, PASTE_LABEL, noticeDetail } from "../web/src/text.ts";
import { openSettings } from "./screen-checks.ts";

const HELD_NOTE = "Written while a restore holds the library.";

const HELD_LINK = "https://example.com/guides/held-by-a-restore";

export async function heldNoteSave(page: Page): Promise<void> {
  const note = page.getByRole("textbox", { name: NOTE_TITLE, exact: true });

  await note.fill(HELD_NOTE);
  await page.getByRole("button", { name: NOTE_SAVE, exact: true }).click();
  await expect(page.getByText(NOTE_RESTORING, { exact: true })).toBeVisible();
  await expect(note).toHaveValue(HELD_NOTE);
}

export async function heldPaste(page: Page): Promise<void> {
  const field = page.getByRole("textbox", { name: PASTE_LABEL });

  await field.fill(HELD_LINK);
  await page.getByRole("button", { name: ADD_LABEL }).click();
  await expect(
    page.getByText(noticeDetail("restoring", "paste") ?? "", { exact: true }),
  ).toBeVisible();
  await expect(field).toHaveValue(HELD_LINK);
}

export async function heldSettingPick(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();

  const choice = page.getByRole("radiogroup", { name: REDDIT_TEXT.fieldLabel });
  const was = await choice.getByRole("radio", { checked: true }).getAttribute("id");

  await choice.getByRole("radio", { checked: false }).click();
  await expect(page.getByText(REDDIT_TEXT.restoring, { exact: true })).toBeVisible();
  await expect(choice.getByRole("radio", { checked: true })).toHaveAttribute("id", was ?? "");
}
