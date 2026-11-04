import { type Page, expect, test } from "@playwright/test";

import { listAll, listForRun, refusedWith } from "./api.ts";
import { newRunId, pasteLink, scenarioLinks } from "./links.ts";
import { restartTarget } from "./target.ts";

const SOURCE_LABELS = ["Reddit", "X", "GitHub", "Other"];

const REFUSED_BODIES = [
  '{"url":"javascript:alert(1)"}',
  '{"url":"ftp://example.com/x"}',
  '{"url":"not a url"}',
  '{"url":""}',
  undefined,
];

function listedRows(page: Page, count: number) {
  return page.locator(".it").evaluateAll(
    (rows, limit) =>
      rows.slice(0, limit).map((row) => ({
        link: row.querySelector(".it-open")?.textContent ?? "",
        source: row.querySelector(".src")?.textContent ?? "",
        date: row.querySelector(".it-date")?.textContent ?? "",
      })),
    count,
  );
}

async function expectListMatches(
  page: Page,
  run: string,
  request: Parameters<typeof listForRun>[0],
) {
  const items = await listForRun(request, run);
  await expect(page.locator(".it").nth(items.length - 1)).toBeVisible();
  const rows = await listedRows(page, items.length);
  expect(rows.map((row) => row.link)).toEqual(
    items.map((item) => item.normalizedUrl.replace(/^https?:\/\//u, "")),
  );

  for (const row of rows) {
    expect(SOURCE_LABELS).toContain(row.source);
    expect(row.date).toMatch(/^saved /u);
  }
}

test("twelve pasted links make eleven Items that keep their order across a restart", async ({
  page,
  request,
  baseURL,
}) => {
  const run = newRunId();
  const links = scenarioLinks(run);
  await page.goto("/");

  for (const url of links) {
    await pasteLink(page, url);
  }

  const before = await listForRun(request, run);
  expect(before).toHaveLength(11);
  expect(before.map((item) => item.id)).toEqual(
    before.toSorted((a, b) => b.savedAt - a.savedAt || b.id - a.id).map((item) => item.id),
  );
  await expectListMatches(page, run, request);

  const total = (await listAll(request)).length;

  for (const body of REFUSED_BODIES) {
    const refused = await refusedWith(request, body);
    expect(refused.status).toBe(400);
  }

  expect(await listAll(request)).toHaveLength(total);

  await restartTarget(baseURL ?? "");
  expect(await listForRun(request, run)).toEqual(before);
  await page.goto("/");
  await expectListMatches(page, run, request);

  await pasteLink(page, links[2] ?? "");
  expect(await listForRun(request, run)).toEqual(before);
});
