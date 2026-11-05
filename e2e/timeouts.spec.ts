import { type Locator, type Page, expect, test } from "@playwright/test";

import { SAVING_LABEL, SAVING_STATUS } from "../web/src/text.ts";
import { postLinkRaw, settled } from "./api.ts";
import { ADDED } from "./card.ts";
import { ANSWER_MS, HOP_DEADLINE_MS, STALLED } from "./ingest.ts";
import { addButton, newRunId, pasteCard, pasteField, pasteStatus } from "./links.ts";
import { afterTwoFrames } from "./look.ts";

const OVERHEAD_MS = 5000;

const DRIP = "https://httpbin.org/drip?duration=10&numbytes=10";
const SLOW_SHORT_LINK = "https://is.gd/g8TLgI";

function withRun(base: string, run: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}run=${run}`;
}

for (const [what, base] of [
  ["a host that never answers", STALLED],
  ["a body that stalls", DRIP],
] as const) {
  test(`${what} is answered at once as processing and ends failed with timeout at the hop deadline`, async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const url = withRun(base, newRunId());
    const started = Date.now();
    const { status, body } = await postLinkRaw(request, url);
    const answered = Date.now() - started;

    expect(status, url).toBe(201);
    expect(body.item.status, url).toBe("processing");
    expect(body.item.fetch, url).toBeNull();
    expect(answered, `${url} answered in ${answered} ms`).toBeLessThan(ANSWER_MS);

    const item = await settled(request, body.item.id);
    const elapsed = Date.now() - started;

    expect(item, url).toMatchObject({ status: "failed", reason: "timeout", fetch: "timeout" });
    expect(item.title, url).toBeNull();
    expect(elapsed, url).toBeGreaterThanOrEqual(HOP_DEADLINE_MS - 500);
    expect(elapsed, url).toBeLessThan(HOP_DEADLINE_MS + OVERHEAD_MS);
  });
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
    .toHaveText(SAVING_STATUS, { timeout: 1_000 });
}

test("a short link whose target answers slowly keeps the paste box in its saving state for the whole wait", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const field = pasteField(page);
  await field.fill(SLOW_SHORT_LINK);

  const answered = page.waitForResponse(
    (response) => response.url().endsWith("/api/items") && response.request().method() === "POST",
  );

  const add = addButton(page);
  const idleWidth = (await add.boundingBox())?.width ?? 0;
  const started = Date.now();
  await add.click();

  const saving = page.getByRole("button", { name: SAVING_LABEL });
  await expect(saving).toBeDisabled();
  await expect(field).toHaveValue(SLOW_SHORT_LINK);
  await expectSavingState(page, saving, idleWidth);

  const response = await answered;
  expect(Date.now() - started).toBeGreaterThanOrEqual(5_000);
  expect([200, 201]).toContain(response.status());
  await expect(pasteCard(page)).toContainText(ADDED, { timeout: 10_000 });
  await expect(addButton(page)).toBeEnabled();
});
