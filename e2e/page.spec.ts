import { AxeBuilder } from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { ownerContext } from "./access.ts";
import { listAll, postLink } from "./api.ts";
import { addButton, newRunId } from "./links.ts";

async function expectLightDrawn(page: Page, colorScheme: string): Promise<void> {
  for (const root of [page.locator(".app"), page.locator("html")]) {
    await expect(root, `${colorScheme} system preference`).toHaveAttribute("data-theme", "light");
    await expect(root, `${colorScheme} system preference`).toHaveCSS("color-scheme", "light");
  }

  const drawn = await page.evaluate(() => {
    const [light, dark] = ["light", "dark"].map((theme) => {
      const probe = document.createElement("div");
      probe.dataset["theme"] = theme;
      probe.style.background = "var(--bg)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return colour;
    });

    return { html: getComputedStyle(document.documentElement).backgroundColor, light, dark };
  });

  expect(drawn.html, `${colorScheme} system preference: Light's background`).toBe(drawn.light);
  expect(drawn.html, `${colorScheme} system preference: not Dark's`).not.toBe(drawn.dark);
}

test("an empty browser draws Light under a dark and a light system preference, titled Threadsift, from one origin", async ({
  browser,
  baseURL,
  request,
}) => {
  await postLink(request, `https://example.com/${newRunId()}/seed`);

  for (const colorScheme of ["dark", "light"] as const) {
    const context = await ownerContext(browser, { colorScheme });

    const page = await context.newPage();
    const origins = new Set<string>();
    page.on("request", (pageRequest) => origins.add(new URL(pageRequest.url()).origin));

    await page.goto(baseURL ?? "/");
    await expect(page.locator("article.it").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Threadsift");

    await expectLightDrawn(page, colorScheme);
    expect([...origins]).toEqual([new URL(baseURL ?? "").origin]);
    await context.close();
  }
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

  const context = await ownerContext(browser, { timezoneId: "Europe/Istanbul" });
  const page = await context.newPage();
  const date = page.locator("article.it", { hasText: run }).locator(".it-date");

  await page.clock.setFixedTime(item.savedAt);
  await page.goto("/");
  await expect(date).toHaveText("saved today");

  await page.clock.setFixedTime(nextMidnight - 60_000);
  await page.reload();
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
  await addButton(page).click();
  await expect(page.getByRole("alert")).toBeVisible();

  const results = await new AxeBuilder({ page }).withRules(["region"]).analyze();

  expect(results.violations.map((violation) => violation.nodes.map((node) => node.html))).toEqual(
    [],
  );
});

test("the saved Items are one list, named by its count, with one list item per Item", async ({
  page,
  request,
}) => {
  const run = newRunId();

  for (const name of ["first", "second", "third"]) {
    await postLink(request, `https://example.com/${run}/${name}`);
  }

  const items = await listAll(request);
  const total = items.length;
  const unread = items.filter((item) => item.readState === "unread").length;
  await page.goto("/");

  const list = page.getByRole("list");
  await expect(list).toHaveCount(1);
  await expect(list).toHaveAccessibleName(`${total} items, ${unread} unread`);
  await expect(list.getByRole("listitem")).toHaveCount(total);
  await expect(list.getByRole("listitem").first().getByRole("article")).toBeVisible();
});
