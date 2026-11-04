import { expect, test } from "@playwright/test";

import { listAll } from "./api.ts";
import { newRunId } from "./links.ts";

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
    await expect(page.getByRole("alert")).toContainText(sentence, { timeout: 20_000 });
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
