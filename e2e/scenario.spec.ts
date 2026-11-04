import { type Page, expect, test } from "@playwright/test";

import { listAll, listForRun, refusedWith } from "./api.ts";
import { newRunId, pasteLink, scenarioLinks, scenarioUrls } from "./links.ts";
import { restartTarget } from "./target.ts";

const REFUSED_BODIES = [
  '{"url":"javascript:alert(1)"}',
  '{"url":"ftp://example.com/x"}',
  '{"url":"not a url"}',
  '{"url":""}',
  undefined,
];

function listedRows(page: Page, count: number) {
  return page.locator("article.it").evaluateAll(
    (rows, limit) =>
      rows.slice(0, limit).map((row) => ({
        link: row.querySelector(".it-open")?.firstChild?.textContent ?? "",
        date: row.querySelector(".it-date")?.textContent ?? "",
      })),
    count,
  );
}

async function expectListMatches(page: Page, expectedUrls: readonly string[]) {
  await expect(page.locator("article.it").nth(expectedUrls.length - 1)).toBeVisible();
  const rows = await listedRows(page, expectedUrls.length);
  expect(rows.map((row) => row.link)).toEqual(
    expectedUrls.map((url) => url.replace(/^https?:\/\//u, "")),
  );

  for (const row of rows) {
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
  const newestFirst = scenarioUrls(run).toReversed();
  await page.goto("/");

  for (const url of links) {
    await pasteLink(page, url);
  }

  const before = await listForRun(request, run);
  expect(before).toHaveLength(11);
  expect(before.map((item) => item.normalizedUrl)).toEqual(newestFirst);
  await expectListMatches(page, newestFirst);

  const total = (await listAll(request)).length;

  for (const body of REFUSED_BODIES) {
    const refused = await refusedWith(request, body);
    expect(refused.status).toBe(400);
  }

  expect(await listAll(request)).toHaveLength(total);

  await restartTarget(baseURL ?? "");
  expect(await listForRun(request, run)).toEqual(before);
  await page.goto("/");
  await expectListMatches(page, newestFirst);

  await pasteLink(page, links[2] ?? "");
  expect(await listForRun(request, run)).toEqual(before);
});
