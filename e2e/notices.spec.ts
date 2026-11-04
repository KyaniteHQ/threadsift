import { expect, test } from "@playwright/test";

import { listAll, listForRun } from "./api.ts";
import { newRunId, pasteStatus } from "./links.ts";

const REDIRECTOR = "https://httpbin.dev/redirect-to?url=";

function failedLinks(run: string) {
  return [
    [`${REDIRECTOR}${encodeURIComponent("http://127.0.0.1:9/")}&run=${run}`, "private network"],
    [`https://httpbin.org/redirect/21?run=${run}`, "redirected too many times"],
    [`https://example.com/missing-${run}`, "answered with an error"],
    [`https://no-such-host-${run}.invalid/`, "Couldn’t reach the website"],
    [`https://httpbin.org/get?run=${run}`, "has no title"],
  ] as const;
}

test("each failed fetch shows its own notice and the list still shows the saved Item", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });

  for (const [url, sentence] of failedLinks(run)) {
    await field.fill(url);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(pasteStatus(page)).toContainText(sentence, { timeout: 20_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(field).toHaveValue("");
    await expect(page.locator("article.it", { hasText: run }).first()).toBeVisible();
  }

  const stored = (await listAll(request)).filter((item) => item.normalizedUrl.includes(run));
  expect(stored).toHaveLength(failedLinks(run).length);
  expect(stored.map((item) => item.title)).toEqual(stored.map(() => null));
});

test("a link to a private address shows a notice, keeps the text and saves nothing", async ({
  page,
  request,
}) => {
  const before = (await listAll(request)).length;
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill("http://127.0.0.1:9/");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("alert")).toContainText("can’t be saved");
  await expect(field).toHaveValue("http://127.0.0.1:9/");
  expect(await listAll(request)).toHaveLength(before);
});

test("a notice about a saved link names that link and offers Try again only when asking again can help", async ({
  page,
}) => {
  const run = newRunId();
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await page.goto("/");

  await field.fill(`https://example.com/missing-${run}`);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".ps .ps-url")).toHaveText(`example.com/missing-${run}`);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await field.fill(`https://www.no-such-host-${run}.invalid/a`);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".ps .ps-url")).toHaveText(`no-such-host-${run}.invalid/a`);
});

test("Try again on an unreachable website saves the same link again", async ({ page, request }) => {
  const run = newRunId();
  const url = `https://no-such-host-${run}.invalid/`;
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill(url);
  await page.getByRole("button", { name: "Add" }).click();

  const tryAgain = page.getByRole("button", { name: "Try again" });
  await expect(tryAgain).toBeVisible({ timeout: 20_000 });

  const again = page.waitForRequest(
    (sent) => sent.url().endsWith("/api/items") && sent.method() === "POST",
  );

  await tryAgain.click();
  expect((await again).postDataJSON()).toEqual({ url });
  await expect(pasteStatus(page)).toContainText("Couldn’t reach the website");
  await expect(field).toBeFocused();
  expect(await listForRun(request, run)).toHaveLength(1);
});

test("after a save that worked the field is not marked invalid and still points at its notice", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill(`https://example.com/missing-${newRunId()}`);
  await page.getByRole("button", { name: "Add" }).click();

  const notice = page.locator(".ps");
  await expect(notice).toContainText("answered with an error");
  await expect(field).toHaveValue("");
  await expect(field).not.toHaveAttribute("aria-invalid", /./u);
  await expect(field).toHaveAttribute("aria-describedby", (await notice.getAttribute("id")) ?? "");
});
