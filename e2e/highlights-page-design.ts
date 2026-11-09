import { AxeBuilder } from "@axe-core/playwright";
import { type Page, type TestInfo, expect } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { expectNoViolations } from "./design-screens.ts";
import { entries, links, moreButton, searchBox } from "./highlights-page-ui.ts";

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

export async function expectAccessible(page: Page, name: string, scope = "body"): Promise<void> {
  const results = await new AxeBuilder({ page }).include(scope).analyze();

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

async function expectFocusRing(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Shift");

  for (const [what, target] of [
    ["entry link", links(page).first()],
    ["search field", searchBox(page)],
  ] as const) {
    await target.focus();

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

    expect(ring.outline || ring.rowOutline, `${name}: the focused ${what} has an outline`).toBe(
      true,
    );
  }
}

export async function check(
  page: Page,
  name: string,
  { forced, width }: Readonly<{ forced: boolean; width: number }>,
): Promise<void> {
  if (forced) {
    if ((await entries(page).count()) > 0) await expectFocusRing(page, name);

    return;
  }

  await expectNoViolations(page, name);
  await expectAccessible(page, name);

  if (width < PHONE_WIDTH && (await entries(page).count()) > 0) {
    await expectStretchedLinks(page, name);
  }
}

export async function walkStates(
  page: Page,
  name: string,
  mode: Readonly<{ forced: boolean; width: number }>,
  shot: (state: string) => Promise<void>,
): Promise<void> {
  await expect(entries(page)).toHaveCount(50);
  await expect(moreButton(page)).toBeVisible();
  await check(page, `${name} list`, mode);
  await shot("list");

  await page.route(isNextPage, (route) => route.abort());
  await moreButton(page).click();
  await expect(page.getByText(HIGHLIGHTS_PAGE.loadMoreFailed)).toBeVisible();
  await check(page, `${name} load more failed`, mode);
  await shot("more-failed");
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
  await page.unroute(isPage);
}
