import { type Page, expect } from "@playwright/test";

import { IMPORT, countLabel } from "../web/src/import-text.ts";
import { BACK_TO_LIBRARY } from "../web/src/text.ts";
import { libraryHeading } from "./access-flow.ts";
import { openPanel } from "./screen-checks.ts";

const IMPORT_IDS = ["2000000001", "2000000002", "2000000003"];

const IMPORT_LIST = IMPORT_IDS.map((id) => `https://x.com/importer/status/${id}`);

const importBox = (page: Page) => page.getByLabel(IMPORT.boxLabel, { exact: true });

export async function importList(page: Page): Promise<void> {
  await openPanel(page);
  await page.getByRole("link", { name: IMPORT.settingsLink }).click();
  await expect(page).toHaveTitle("Import, Threadsift");
  await importBox(page).fill(IMPORT_LIST.join("\n"));
  await page.getByRole("button", { name: IMPORT.start }).click();
  await expect(
    page.getByText(countLabel(IMPORT_LIST.length, "added"), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(IMPORT.finished)).toBeVisible();
  await page.getByRole("link", { name: BACK_TO_LIBRARY }).click();
  await expect(libraryHeading(page)).toBeVisible();

  await expect(
    page
      .locator("article.it.it-link-only")
      .filter({ hasText: new RegExp(`x\\.com/i/status/(${IMPORT_IDS.join("|")})`, "u") }),
  ).toHaveCount(IMPORT_IDS.length);
}

export async function importListAgain(page: Page): Promise<void> {
  await page.goto("/import");
  await importBox(page).fill(IMPORT_LIST.join("\n"));
  await expect(page.getByText(IMPORT.resumeComplete)).toBeVisible();
}
