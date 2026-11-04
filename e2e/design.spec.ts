import { type Locator, expect, test } from "@playwright/test";

import { postLink } from "./api.ts";
import { collectViolations } from "./design-checks.ts";
import { newRunId } from "./links.ts";

const BANDS_AT_WIDTH = [
  [390, "phone narrow medium wide full"],
  [600, "narrow medium wide full"],
  [1440, "full"],
  [1920, "full"],
] as const;

const THEMES = ["light", "dark", "sepia"];

test("the page keeps the design checks at four widths in three themes", async ({
  page,
}, testInfo) => {
  const run = newRunId();
  const seeded = [];
  const paths = ["a".repeat(300), "short", "docs/guide?id=alpha&page=2", "x", "y", "z"];

  for (const path of paths) {
    seeded.push(await postLink(page.request, `https://example.com/${run}/${path}`));
  }

  await page.goto(seeded[0]?.body.url ?? "/");
  await expect(page.locator(".it.open")).toBeVisible();
  await page.getByRole("textbox", { name: "Paste a link to save" }).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator(".it.open .it-open").focus();

  for (const [width, bands] of BANDS_AT_WIDTH) {
    await page.setViewportSize({ width, height: 900 });

    for (const theme of THEMES) {
      await page.evaluate((value) => {
        document.documentElement.dataset["theme"] = value;
      }, theme);
      await expect(page.locator(".app")).toHaveAttribute("data-bp", bands);

      for (const row of [".it.open", "article.it:not(.open)"]) {
        await page.locator(`${row} .it-open`).first().focus();
        await expect(page.locator(".it:has(.it-open:focus-visible)")).toHaveCount(1);
        expect(
          await page.evaluate(collectViolations),
          `${row} focused, ${theme} at ${width}px`,
        ).toEqual([]);
      }

      await testInfo.attach(`${theme}-${width}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
  }
});

test("a long link is clamped to two lines in its row title", async ({ page }) => {
  const run = newRunId();

  const long = await postLink(
    page.request,
    `https://example.com/${run}/${"segment-".repeat(40)}end`,
  );

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(long.body.url);
    const title = page.locator(".it.open .it-title");
    await expect(title).toBeVisible();

    const lines = await title.evaluate((element) => ({
      shown:
        element.clientHeight / Number(getComputedStyle(element).lineHeight.replace(/px$/u, "")),
      cut: element.scrollHeight > element.clientHeight,
    }));

    expect(lines.shown, `title lines at ${width}px`).toBeLessThan(2.1);
    expect(lines.cut, `title is cut at ${width}px`).toBe(true);
  }
});

function renderedLines(link: Locator): Promise<string[]> {
  return link.evaluate((element) => {
    const lines = new Map<number, string>();

    for (const node of element.childNodes) {
      const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "") : "";

      for (let offset = 0; offset < text.length; offset += 1) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? "") + text.charAt(offset));
      }
    }

    return [...lines.entries()].toSorted(([a], [b]) => a - b).map(([, line]) => line);
  });
}

function breaksMidPart(lines: readonly string[]): string[] {
  return lines.slice(1).flatMap((line, index) => {
    const before = lines[index] ?? "";

    return /[/-]$/u.test(before) || /^[._\-?&=#]/u.test(line) ? [] : [`${before} | ${line}`];
  });
}

test("a row title breaks between path parts on a phone and holds the reading measure on a wide screen", async ({
  page,
}) => {
  const run = newRunId();
  const path = `${run}/my_home_server_backup_strategy_after_losing_a_disk/and-what-i-would-do-differently-next-time/`;
  const saved = await postLink(page.request, `https://example.com/${path}`);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(saved.body.url);
  const link = page.locator(".it.open .it-open");
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(`example.com/${path} opens in a new tab`);

  const phoneLines = await renderedLines(link);
  expect(phoneLines.length, "title lines at 390px").toBeGreaterThan(1);
  expect(breaksMidPart(phoneLines), "line breaks inside a path part").toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });

  const wideLines = await renderedLines(link);
  expect(
    Math.max(...wideLines.map((line) => line.length)),
    "longest title line at 1440px",
  ).toBeLessThanOrEqual(75);
});
