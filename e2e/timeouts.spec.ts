import { expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { newRunId } from "./links.ts";

const DEADLINE_MS = 8000;
const OVERHEAD_MS = 5000;

const STALLS = [
  { url: "http://example.com:81/", shortestMs: 0 },
  { url: "https://httpbin.org/drip?duration=10&numbytes=10", shortestMs: DEADLINE_MS - 500 },
];

test("a host that never answers and a body that stalls each time out, while the paste box shows it is saving", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });

  for (const { url: base, shortestMs } of STALLS) {
    const url = `${base}${base.includes("?") ? "&" : "?"}run=${run}`;
    await field.fill(url);

    const answered = page.waitForResponse(
      (response) => response.url().endsWith("/api/items") && response.request().method() === "POST",
    );

    const started = Date.now();
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(page.locator("form[aria-busy='true']")).toHaveCount(1);
    await expect(field).toHaveValue(url);

    const response = await answered;
    const elapsed = Date.now() - started;
    const { fetch: result, item } = SavedItemResponseSchema.parse(await response.json());

    expect(response.status(), url).toBe(201);
    expect(result, url).toBe("timeout");
    expect(item.title, url).toBeNull();
    expect(elapsed, url).toBeGreaterThanOrEqual(shortestMs);
    expect(elapsed, url).toBeLessThan(DEADLINE_MS + OVERHEAD_MS);

    await expect(page.getByRole("alert")).toContainText("didn’t answer in time");
    await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
    await expect(page.locator(`.it[data-key="${item.id}"] .it-open`)).toContainText(
      url.replace(/^https?:\/\//u, ""),
    );
  }
});
