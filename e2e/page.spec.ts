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
  await expect(page.locator(".it").first()).toBeVisible();
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
