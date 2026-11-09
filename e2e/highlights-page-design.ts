import { AxeBuilder } from "@axe-core/playwright";
import { type Locator, type Page, type TestInfo, expect } from "@playwright/test";

import { DEFAULTS } from "../design/system/settings.ts";
import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { collectDesign } from "./design-checks.ts";
import { expectNoViolations } from "./design-screens.ts";
import { entries, links, moreButton, searchBox } from "./highlights-page-ui.ts";

const CONTRAST_RATIO = /: \d+\.\d{2}:1, needs [\d.]+:1$/u;

const PHONE_WIDTH = 480;

export function isPage(url: URL): boolean {
  return url.pathname === "/api/highlights";
}

export function isNextPage(url: URL): boolean {
  return isPage(url) && url.searchParams.has("cursor");
}

export async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);

  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

export async function expectAccessible(
  page: Page,
  name: string,
  scope = "body",
  forced = false,
): Promise<void> {
  const axe = new AxeBuilder({ page }).include(scope);
  const results = await (forced ? axe.disableRules(["color-contrast"]) : axe).analyze();

  expect(
    results.violations.map(({ id, nodes }) => [id, nodes.map(({ html }) => html)]),
    `${name}: accessibility violations`,
  ).toEqual([]);
}

async function expectStretchedLinks(page: Page, name: string): Promise<void> {
  const misses = await entries(page).evaluateAll((rows) => {
    const barBottom = document.querySelector(".pg-bar")?.getBoundingClientRect().bottom ?? 0;

    return rows.flatMap((row, index) => {
      const box = row.getBoundingClientRect();
      const visible = box.top >= barBottom && box.bottom <= innerHeight;
      const hit = visible ? document.elementFromPoint(box.right - 6, box.bottom - 6) : null;

      return visible && (hit?.closest("a.hp-open") === null || box.height < 44) ? [index] : [];
    });
  });

  expect(misses, `${name}: entries whose whole row is not a 44 px link`).toEqual([]);
}

async function expectGeometry(page: Page, name: string): Promise<void> {
  const { violations } = await page.evaluate(collectDesign, DEFAULTS.font);

  expect(
    violations.filter((violation) => !CONTRAST_RATIO.test(violation)),
    `${name}: design violations other than contrast ratios`,
  ).toEqual([]);
}

async function expectFocusRing(page: Page, name: string, what: string, target: Locator) {
  await page.keyboard.press("Shift");
  await target.focus();
  await expect(target, `${name}: the ${what} takes the focus`).toBeFocused();

  const ring = await target.evaluate((element) => {
    const row = element.closest("article.hp-it, .field") ?? element;
    const { outlineStyle, outlineWidth } = getComputedStyle(element);
    const rowStyle = getComputedStyle(row);

    return {
      outline: outlineStyle !== "none" && Number(outlineWidth.replace(/px$/u, "")) > 0,
      rowOutline:
        rowStyle.outlineStyle !== "none" && Number(rowStyle.outlineWidth.replace(/px$/u, "")) > 0,
    };
  });

  expect(ring.outline || ring.rowOutline, `${name}: the focused ${what} has an outline`).toBe(true);
}

async function expectFocusRings(page: Page, name: string): Promise<void> {
  const targets = [
    ["Back link", page.getByRole("link", { name: HIGHLIGHTS_PAGE.back })],
    ["search field", searchBox(page)],
    ["entry link", links(page).first()],
    ["Load more button", moreButton(page)],
    ["Try again button", page.getByRole("button", { name: RETRY_LABEL })],
  ] as const;

  for (const [what, target] of targets) {
    if ((await target.count()) > 0) await expectFocusRing(page, name, what, target);
  }
}

export async function check(
  page: Page,
  name: string,
  { forced, width }: Readonly<{ forced: boolean; width: number }>,
): Promise<void> {
  if (forced) {
    await expectGeometry(page, name);
    await expectFocusRings(page, name);
  } else {
    await expectNoViolations(page, name);
  }

  await expectAccessible(page, name, "body", forced);

  if (width < PHONE_WIDTH && (await entries(page).count()) > 0) {
    await expectStretchedLinks(page, name);
  }
}

async function pressTryAgain(page: Page, name: string, failure: string): Promise<void> {
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(
    page.getByText(failure),
    `${name}: Try again fails again while the answer is refused`,
  ).toBeVisible();
}

export async function walkStates(
  page: Page,
  name: string,
  mode: Readonly<{ forced: boolean; width: number }>,
  shot: (state: string) => Promise<void>,
): Promise<void> {
  const { promise: held, resolve: release } = Promise.withResolvers<void>();

  await page.route(isPage, async (route) => {
    await held;
    await route.continue();
  });

  await page.reload();
  await expect(page.getByText(HIGHLIGHTS_PAGE.loading)).toBeAttached();
  await check(page, `${name} loading`, mode);
  await shot("loading");
  release();
  await expect(entries(page)).toHaveCount(50);
  await page.unroute(isPage);
  await expect(moreButton(page)).toBeVisible();
  await check(page, `${name} list`, mode);
  await shot("list");

  await page.route(isNextPage, (route) => route.abort());
  await moreButton(page).click();
  await expect(page.getByText(HIGHLIGHTS_PAGE.loadMoreFailed)).toBeVisible();
  await check(page, `${name} load more failed`, mode);
  await shot("more-failed");
  await pressTryAgain(page, `${name} load more failed`, HIGHLIGHTS_PAGE.loadMoreFailed);
  await page.unroute(isNextPage);

  await searchBox(page).fill("nothing holds this");
  await expect(page.getByText(HIGHLIGHTS_PAGE.noResults)).toBeVisible();
  await check(page, `${name} no results`, mode);
  await shot("no-results");
  await searchBox(page).fill("");

  await page.route(isPage, (route) => route.abort());
  await page.reload();
  await expect(page.getByText(HIGHLIGHTS_PAGE.loadFailed)).toBeVisible();
  await check(page, `${name} failed`, mode);
  await shot("failed");
  await pressTryAgain(page, `${name} failed`, HIGHLIGHTS_PAGE.loadFailed);
  await page.unroute(isPage);
}
