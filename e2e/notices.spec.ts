import { expect, test } from "@playwright/test";

import { listAll, listForRun } from "./api.ts";
import {
  X_POST,
  newRunId,
  pasteCard,
  pasteField,
  pasteLink,
  pasteStatus,
  retryButton,
  submitLink,
  throughRedirects,
} from "./links.ts";

function failedLinks(run: string) {
  return [
    [`${throughRedirects("http://127.0.0.1:9/", 1)}&run=${run}`, "private network"],
    [`${throughRedirects("ftp://example.com/file", 1)}&run=${run}`, "isn’t a web page"],
    [`${throughRedirects(X_POST, 1)}&run=${run}`, "redirected to Reddit or X"],
    [`https://httpbin.org/redirect/21?run=${run}`, "redirected too many times"],
    [`https://example.com/missing-${run}`, "answered with an error"],
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
  const field = pasteField(page);

  for (const [index, [url, sentence]] of failedLinks(run).entries()) {
    await submitLink(page, url);
    await expect(pasteStatus(page)).toContainText(sentence, { timeout: 20_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(field).toHaveValue("");
    await expect(page.locator("article.it", { hasText: run })).toHaveCount(index + 1);
  }

  const stored = await listForRun(request, run);
  expect(stored).toHaveLength(failedLinks(run).length);
  expect(stored.map((item) => item.title)).toEqual(stored.map(() => null));
});

test("a link to a private address shows a notice, keeps the text and saves nothing", async ({
  page,
  request,
}) => {
  const before = (await listAll(request)).length;
  await page.goto("/");
  const field = pasteField(page);
  await submitLink(page, "http://127.0.0.1:9/");

  await expect(page.getByRole("alert")).toContainText("can’t be saved");
  await expect(field).toHaveValue("http://127.0.0.1:9/");
  expect(await listAll(request)).toHaveLength(before);
});

test("a notice about a saved link names that link and offers Try again only when asking again can help", async ({
  page,
}) => {
  const run = newRunId();
  await page.goto("/");

  await submitLink(page, `https://example.com/missing-${run}`);
  await expect(pasteCard(page)).toContainText("answered with an error", { timeout: 20_000 });
  await expect(pasteCard(page).locator(".ps-url")).toHaveText(`example.com/missing-${run}`);
  await expect(retryButton(page)).toHaveCount(0);

  await submitLink(page, `https://www.no-such-host-${run}.invalid/a`);
  await expect(pasteCard(page).locator(".ps-url")).toHaveText(`no-such-host-${run}.invalid/a`);
  await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
});

test("Try again on an unreachable website saves the same link again", async ({ page, request }) => {
  const run = newRunId();
  const url = `https://no-such-host-${run}.invalid/`;
  await page.goto("/");
  const field = pasteField(page);
  await submitLink(page, url);

  const tryAgain = retryButton(page);
  await expect(tryAgain).toBeVisible({ timeout: 20_000 });

  const again = page.waitForRequest(
    (sent) => sent.url().endsWith("/api/items") && sent.method() === "POST",
  );

  await tryAgain.click();
  expect((await again).postDataJSON()).toEqual({ url });
  await expect(pasteCard(page)).toContainText("Couldn’t reach the website", { timeout: 20_000 });
  await expect(page.getByRole("alert")).toContainText("Couldn’t reach the website");
  await expect(field).toBeFocused();
  expect(await listForRun(request, run)).toHaveLength(1);
});

test("after a save that worked the field is not marked invalid and still points at its notice", async ({
  page,
}) => {
  await page.goto("/");
  const field = pasteField(page);
  await submitLink(page, `https://example.com/missing-${newRunId()}`);

  const notice = pasteCard(page);
  await expect(notice).toContainText("answered with an error", { timeout: 20_000 });
  await expect(field).toHaveValue("");
  await expect(field).not.toHaveAttribute("aria-invalid", /./u);
  const noticeId = await notice.getAttribute("id");
  expect(noticeId).toBeTruthy();
  await expect(field).toHaveAttribute("aria-describedby", noticeId ?? "");
});

test("the status region announces its whole text politely", async ({ page }) => {
  await page.goto("/");
  const status = pasteStatus(page);

  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
});

test("a known link whose title cannot be fetched again keeps its title and says so", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await pasteLink(page, "https://news.ycombinator.com/");

  await submitLink(page, "https://www.news.ycombinator.com/");

  await expect(pasteStatus(page)).toContainText("the title saved earlier was kept", {
    timeout: 20_000,
  });

  await expect(pasteCard(page).locator(".ps-title")).toHaveText("Already saved, refreshed");

  await expect(page.getByRole("alert")).toHaveCount(0);

  const kept = (await listAll(request)).filter(
    (item) => item.normalizedUrl === "https://news.ycombinator.com/",
  );

  expect(kept.map((item) => item.title)).toEqual(["Hacker News"]);
});
