import { type Locator, type Page, expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { addButton, newRunId, pasteField, pasteStatus, rowOf } from "./links.ts";

const DEADLINE_MS = 8000;
const OVERHEAD_MS = 5000;

const STALLS = [
  { url: "http://example.com:81/", showsSaving: false },
  { url: "https://httpbin.org/drip?duration=10&numbytes=10", showsSaving: true },
];

async function expectSavingState(page: Page, saving: Locator, idleWidth: number) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

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

test("a host that never answers and a body that stalls each time out, while the paste box shows it is saving", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await page.goto("/");
  const field = pasteField(page);

  for (const { url: base, showsSaving } of STALLS) {
    const url = `${base}${base.includes("?") ? "&" : "?"}run=${run}`;
    await field.fill(url);

    const answered = page.waitForResponse(
      (response) => response.url().endsWith("/api/items") && response.request().method() === "POST",
    );

    const add = addButton(page);
    const idleWidth = (await add.boundingBox())?.width ?? 0;
    const started = Date.now();
    await add.click();

    const saving = page.getByRole("button", { name: "Saving…" });
    await expect(saving).toBeDisabled();
    await expect(field).toHaveValue(url);

    if (showsSaving) {
      await expectSavingState(page, saving, idleWidth);
    }

    const response = await answered;
    const elapsed = Date.now() - started;
    const { fetch: result, item } = SavedItemResponseSchema.parse(await response.json());

    expect(response.status(), url).toBe(201);
    expect(result, url).toBe("timeout");
    expect(item.title, url).toBeNull();
    expect(elapsed, url).toBeGreaterThanOrEqual(DEADLINE_MS - 500);
    expect(elapsed, url).toBeLessThan(DEADLINE_MS + OVERHEAD_MS);

    await expect(pasteStatus(page)).toContainText("didn’t answer in time");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(addButton(page)).toBeEnabled();
    await expect(rowOf(page, item.id).locator(".it-open")).toContainText(
      url.replace(/^https?:\/\//u, ""),
    );
  }
});
