import { readFile } from "node:fs/promises";

import { type Page, expect } from "@playwright/test";
import { z } from "zod";

import { EXPORT_TEXT } from "../web/src/export-text.ts";
import { expectFitsPhone, openInstanceSettings } from "./screen-checks.ts";
import { readStoredZip } from "./zip-read.ts";

const EXPORT_WAIT_MS = 90_000;

const ItemIdsSchema = z.object({
  items: z.array(z.object({ id: z.number().int() })),
  counts: z.object({ total: z.number().int() }),
});

const ManifestSchema = z.object({
  format: z.number().int(),
  tables: z.record(z.string(), z.object({ files: z.array(z.string()), rows: z.number().int() })),
});

const section = (page: Page) => page.getByRole("region", { name: EXPORT_TEXT.sectionTitle });

const sectionButton = (page: Page, name: string) =>
  section(page).getByRole("button", { name, exact: true });

async function savedItemIds(page: Page): Promise<readonly number[]> {
  const read = await page.request.get("/api/items");
  const { items, counts } = ItemIdsSchema.parse(await read.json());

  expect(items).toHaveLength(counts.total);

  return items.map(({ id }) => id).toSorted((a, b) => a - b);
}

const RowIdSchema = z.object({ id: z.number().int() });

function rowIds(bytes: Uint8Array | undefined): readonly number[] {
  return new TextDecoder()
    .decode(bytes)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => RowIdSchema.parse(JSON.parse(line)).id);
}

async function downloadedZip(page: Page): Promise<ReadonlyMap<string, Uint8Array>> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    section(page).getByRole("link", { name: EXPORT_TEXT.download, exact: true }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^threadsift-\d{4}-\d{2}-\d{2}\.zip$/u);

  return readStoredZip(await readFile(await download.path()));
}

function expectManifestNamesItems(
  zip: ReadonlyMap<string, Uint8Array>,
  itemIds: readonly number[],
): void {
  const manifestName = [...zip.keys()].find((name) => name.endsWith("/threadsift.json"));

  expect(manifestName).toMatch(/^threadsift-\d{4}-\d{2}-\d{2}\/threadsift\.json$/u);

  const manifest = ManifestSchema.parse(
    JSON.parse(new TextDecoder().decode(zip.get(manifestName ?? ""))),
  );

  const items = manifest.tables["items"];
  const root = manifestName?.slice(0, -"threadsift.json".length) ?? "";

  expect(items?.rows).toBe(itemIds.length);

  const ids = (items?.files ?? []).flatMap((file) => rowIds(zip.get(`${root}${file}`)));

  expect(ids.toSorted((a, b) => a - b)).toEqual(itemIds);
}

export async function backupFlow(page: Page): Promise<void> {
  const itemIds = await savedItemIds(page);

  expect(itemIds.length).toBeGreaterThan(0);

  await openInstanceSettings(page);
  await expect(page.getByRole("heading", { name: EXPORT_TEXT.sectionTitle })).toBeVisible();
  await expect(page.getByText(EXPORT_TEXT.caution)).toBeVisible();
  await expect(sectionButton(page, EXPORT_TEXT.start)).toBeVisible();

  await sectionButton(page, EXPORT_TEXT.start).click();
  await expect(section(page).getByText(EXPORT_TEXT.ready)).toBeVisible({ timeout: EXPORT_WAIT_MS });
  await expect(sectionButton(page, EXPORT_TEXT.remove)).toBeVisible();

  await page.reload();
  await expect(section(page).getByText(EXPORT_TEXT.ready)).toBeVisible();

  expectManifestNamesItems(await downloadedZip(page), itemIds);

  await expectFitsPhone(page);

  await sectionButton(page, EXPORT_TEXT.remove).click();
  await expect(sectionButton(page, EXPORT_TEXT.start)).toBeVisible();
  await expect(section(page).getByText(EXPORT_TEXT.ready)).toHaveCount(0);
}
