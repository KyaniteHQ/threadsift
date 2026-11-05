import { type Locator, type Page, expect, test } from "@playwright/test";
import type { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { SAVING_LABEL } from "../web/src/text.ts";
import { postLink } from "./api.ts";
import { addButton, newRunId, pasteField, pasteStatus, retryButton, rowOf } from "./links.ts";
import { afterTwoFrames } from "./look.ts";

const DEADLINE_MS = 8000;
const OVERHEAD_MS = 5000;

const UNREACHABLE = "http://example.com:81/";
const DRIP = "https://httpbin.org/drip?duration=10&numbytes=10";

function withRun(base: string, run: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}run=${run}`;
}

type Saved = z.infer<typeof SavedItemResponseSchema>;

function expectTimedOut(url: string, status: number, saved: Saved, elapsed: number): void {
  expect(status, url).toBe(201);
  expect(saved.fetch, url).toBe("timeout");
  expect(saved.item.title, url).toBeNull();
  expect(elapsed, url).toBeGreaterThanOrEqual(DEADLINE_MS - 500);
  expect(elapsed, url).toBeLessThan(DEADLINE_MS + OVERHEAD_MS);
}

async function expectSavingState(page: Page, saving: Locator, idleWidth: number) {
  await afterTwoFrames(page);

  await saving.hover();
  await expect
    .soft(saving, "Add does not light up under the pointer while saving")
    .toHaveCSS("filter", "none");
  await expect.soft(saving, "Add keeps focus while saving").toBeFocused({ timeout: 1_000 });
  await expect
    .soft(saving.locator("svg.spin"), "spinner before the label")
    .toBeVisible({ timeout: 1_000 });
  expect
    .soft((await saving.boundingBox())?.width, "button width while saving")
    .toBeCloseTo(idleWidth, 0);
  await expect
    .soft(pasteStatus(page), "saving announced")
    .toHaveText("Saving link and fetching page title…", { timeout: 1_000 });
}

async function addWhileSaving(page: Page, url: string) {
  const field = pasteField(page);
  await field.fill(url);

  const answered = page.waitForResponse(
    (response) => response.url().endsWith("/api/items") && response.request().method() === "POST",
  );

  const add = addButton(page);
  const idleWidth = (await add.boundingBox())?.width ?? 0;
  const started = Date.now();
  await add.click();

  const saving = page.getByRole("button", { name: SAVING_LABEL });
  await expect(saving).toBeDisabled();
  await expect(field).toHaveValue(url);
  await expectSavingState(page, saving, idleWidth);

  const response = await answered;
  const elapsed = Date.now() - started;

  return {
    status: response.status(),
    saved: SavedItemResponseSchema.parse(await response.json()),
    elapsed,
  };
}

test("a host that never answers and a body that stalls each time out, while the paste box shows it is saving", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  const unreachable = withRun(UNREACHABLE, run);
  const dripping = withRun(DRIP, run);
  await page.goto("/");

  const startedUnreachable = Date.now();

  const viaApi = postLink(request, unreachable).then((answer) => ({
    ...answer,
    elapsed: Date.now() - startedUnreachable,
  }));

  const { status, saved, elapsed } = await addWhileSaving(page, dripping);
  expectTimedOut(dripping, status, saved, elapsed);

  await expect(pasteStatus(page)).toContainText("didn’t answer in time");
  await expect(retryButton(page)).toBeVisible();
  await expect(addButton(page)).toBeEnabled();
  await expect(rowOf(page, saved.item.id).locator(".it-open")).toContainText(
    dripping.replace(/^https?:\/\//u, ""),
  );

  const stalled = await viaApi;
  expectTimedOut(unreachable, stalled.status, stalled.body, stalled.elapsed);
});
