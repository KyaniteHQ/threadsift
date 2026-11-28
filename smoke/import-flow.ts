import { type Page, expect } from "@playwright/test";

import { IMPORT, countLabel } from "../web/src/import-text.ts";
import { LIBRARY_LINK } from "../web/src/text.ts";
import { libraryHeading } from "./access-flow.ts";
import { openOwnerMenu } from "./screen-checks.ts";

const IMPORT_IDS = ["2000000001", "2000000002", "2000000003"];

const listOf = (ids: readonly string[]) => ids.map((id) => `https://x.com/importer/status/${id}`);

const IMPORT_LIST = listOf(IMPORT_IDS);

const STALE_LIST = listOf(["2000000004", "2000000005", "2000000006"]);

const importBox = (page: Page) => page.getByLabel(IMPORT.boxLabel, { exact: true });

export async function importList(page: Page): Promise<void> {
  await openOwnerMenu(page);
  await page.getByRole("link", { name: IMPORT.settingsLink, exact: true }).click();
  await expect(page).toHaveTitle("Import, Threadsift");
  await importBox(page).fill(IMPORT_LIST.join("\n"));
  await page.getByRole("button", { name: IMPORT.start }).click();
  await expect(
    page.getByText(countLabel(IMPORT_LIST.length, "added"), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(IMPORT.finished)).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: LIBRARY_LINK, exact: true }).click();
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

export async function startStaleList(page: Page): Promise<void> {
  const stale = await page.context().newPage();
  await stale.goto("/import");
  await importBox(stale).fill(STALE_LIST.join("\n"));
  const staleStart = stale.getByRole("button", { name: IMPORT.start });
  await expect(staleStart).toBeVisible();

  await page.goto("/import");
  await importBox(page).fill(STALE_LIST.join("\n"));
  await page.getByRole("button", { name: IMPORT.start }).click();
  await expect(page.getByText(IMPORT.finished)).toBeVisible();

  const batches: string[] = [];
  stale.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/items/batch") {
      batches.push(request.url());
    }
  });
  await staleStart.click();
  await expect(stale.getByRole("button", { name: IMPORT.again })).toBeVisible();
  expect(batches).toStrictEqual([]);
  await expect(stale.getByText(IMPORT.resumeComplete)).toBeVisible();
  await stale.close();
}
