import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { newRunId } from "./links.ts";

test("an empty browser with a dark system preference draws Light, titled Threadsift, from one origin", async ({
  browser,
  baseURL,
  request,
}) => {
  await postLink(request, `https://example.com/${newRunId()}/seed`);

  const context = await browser.newContext({
    colorScheme: "dark",
    storageState: { cookies: [], origins: [] },
  });

  const page = await context.newPage();
  const origins = new Set<string>();
  page.on("request", (pageRequest) => origins.add(new URL(pageRequest.url()).origin));

  await page.goto(baseURL ?? "/");
  await expect(page.locator("article.it").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Threadsift");
  const app = page.locator(".app");
  await expect(app).not.toHaveAttribute("data-theme", /./u);
  const drawn = await app.evaluate((element) => getComputedStyle(element).getPropertyValue("--bg"));
  await app.evaluate((element) => {
    {
      element.dataset["theme"] = "dark";
    }
  });
  const dark = await app.evaluate((element) => getComputedStyle(element).getPropertyValue("--bg"));
  await app.evaluate((element) => {
    {
      element.dataset["theme"] = "light";
    }
  });
  const light = await app.evaluate((element) => getComputedStyle(element).getPropertyValue("--bg"));

  expect(drawn).toBe(light);
  expect(drawn).not.toBe(dark);
  expect([...origins]).toEqual([new URL(baseURL ?? "").origin]);
  await context.close();
});

test("a link saved before midnight reads as yesterday, not today, in the owner's time zone", async ({
  browser,
  request,
}) => {
  const run = newRunId();
  const { item } = (await postLink(request, `https://example.com/${run}/late-night`)).body;
  const OFFSET_MS = 3 * 3_600_000;
  const DAY_MS = 86_400_000;
  const nextMidnight = (Math.floor((item.savedAt + OFFSET_MS) / DAY_MS) + 1) * DAY_MS - OFFSET_MS;

  const context = await browser.newContext({ timezoneId: "Europe/Istanbul" });
  const page = await context.newPage();
  const date = page.locator("article.it", { hasText: run }).locator(".it-date");

  await page.clock.setFixedTime(item.savedAt);
  await page.goto("/");
  await expect(date).toHaveText("saved today");

  await page.clock.setFixedTime(nextMidnight + 60_000);
  await page.reload();
  await expect(date).toHaveText("saved 1d ago");
  await context.close();
});

test("every part of the page sits inside a landmark", async ({ page, request }) => {
  await postLink(request, `https://example.com/${newRunId()}/landmarks`);
  await page.goto("/");
  await expect(page.locator("article.it").first()).toBeVisible();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  const results = await new AxeBuilder({ page }).withRules(["region"]).analyze();

  expect(results.violations.map((violation) => violation.nodes.map((node) => node.html))).toEqual(
    [],
  );
});
