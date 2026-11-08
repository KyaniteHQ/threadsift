import { type Page, expect } from "@playwright/test";

import { DIGEST_NOT_UPDATED, NO_DIGEST, NOTICES, RETRY_LABEL } from "../web/src/text.ts";
import { alertRegion } from "./card.ts";
import { openRow, reader, row } from "./reader.ts";

function tryAgainIn(scope: ReturnType<typeof row>) {
  return scope.getByRole("button", { name: RETRY_LABEL, exact: true });
}

export async function rowShows(page: Page, id: number, title: string, topic: string) {
  await page.goto("/");
  await expect(row(page, id).locator(".it-title bdi")).toHaveText(title);
  await expect(row(page, id).locator(".it-topic")).toHaveText(topic);
}

export async function retryInBrowser(page: Page, id: number) {
  await page.goto("/");
  await tryAgainIn(row(page, id)).click();
}

export async function retryRefused(page: Page, id: number) {
  await retryInBrowser(page, id);
  await expect(alertRegion(page)).toContainText(NOTICES.failed.text);
  await expect(row(page, id)).toBeVisible();
}

export async function noDigestShows(page: Page, id: number) {
  await page.goto("/");
  await expect(row(page, id).getByText(NO_DIGEST, { exact: true })).toBeVisible();
  await openRow(page, id);
  await expect(reader(page).getByText(NO_DIGEST, { exact: true })).toBeVisible();
  await expect(tryAgainIn(reader(page))).toBeVisible();
}

export async function keptDigestNoteShows(page: Page, id: number) {
  await expect(page.getByText(NO_DIGEST, { exact: true })).toHaveCount(0);
  await expect(row(page, id).getByText(DIGEST_NOT_UPDATED, { exact: true })).toBeVisible();
  await expect(tryAgainIn(row(page, id))).toBeVisible();
}
