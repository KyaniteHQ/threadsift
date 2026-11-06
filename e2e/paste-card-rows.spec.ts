import { type Page, expect, test } from "@playwright/test";

import { RETRY_LABEL, SAVING_LABEL } from "../web/src/text.ts";
import { settled } from "./api.ts";
import {
  ADDED,
  READING,
  REFRESHED,
  SLOW_PAGE,
  UNREACHABLE,
  alertRegion,
  cardTitle,
  countListReads,
  openLibrary,
  pasteForId,
  pasteOnly,
  seed,
  unreachableUrl,
  watchAnnouncements,
} from "./card.ts";
import { newRunId, pasteCard, pasteField, rowOf, titledPage } from "./links.ts";
import { afterTwoFrames } from "./look.ts";

test("a processing row updates in place after a newer Paste replaced its card", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=newer`);
  await pasteOnly(page, `https://example.com/${run}/newer`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a processing row found at page load updates in place", async ({ page, request }) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=reload`);
  await page.reload();
  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();
  const reads = countListReads(page);

  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a row's Try again is a Paste: the card shows, both live regions follow it, the button is described by the row's name, and the list is not read again", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, unreachableUrl(run));
  await page.keyboard.press("Escape");
  const row = rowOf(page, id);
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });

  const name = `no-such-host-${run}.invalid`;
  const retry = row.getByRole("button", { name: RETRY_LABEL });
  await expect(retry).toHaveAccessibleDescription(new RegExp(name, "u"));

  const trace = await watchAnnouncements(page);
  await retry.click();

  await expect(row.locator(".skel i")).toBeVisible();
  await expect(cardTitle(page)).toHaveText(READING);
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
  await expect(alertRegion(page)).toHaveText(`${UNREACHABLE}: ${name}`);
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE);

  const seen = await trace();
  expect(seen.polite.some((text) => text.startsWith(`${READING}: ${name}`))).toBe(true);
  expect(seen.alert).toContain(`${UNREACHABLE}: ${name}`);
  reads.expectNoNewReads();
});

test("a row's Try again pressed while another Paste is saving runs when that Paste ends", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, unreachableUrl(run));
  await page.keyboard.press("Escape");
  const row = rowOf(page, id);
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });

  const mayAnswer = Promise.withResolvers<void>();

  await page.route(/\/api\/items$/u, async (route) => {
    if (route.request().method() === "POST") {
      await mayAnswer.promise;
    }

    await route.continue();
  });

  await pasteOnly(page, titledPage(`Held ${run}`));
  await expect(page.getByRole("button", { name: SAVING_LABEL })).toBeDisabled();
  await row.getByRole("button", { name: RETRY_LABEL }).click();
  mayAnswer.resolve();

  await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE);
});

async function holdFirstItemRead(page: Page) {
  let taken = false;
  const mayFetch = Promise.withResolvers<void>();
  const wasFetched = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  const mayRelease = Promise.withResolvers<void>();

  await page.route(/\/api\/items\/\d+$/u, async (route) => {
    if (taken || route.request().method() !== "GET") {
      await route.continue();

      return;
    }

    taken = true;
    await mayFetch.promise;
    const response = await route.fetch();
    wasFetched.resolve();
    await mayRelease.promise;
    await route.fulfill({ response });
    delivered.resolve();
  });

  return {
    ready: () => {
      mayFetch.resolve();
    },
    wasFetched: wasFetched.promise,
    delivered: delivered.promise,
    release: () => {
      mayRelease.resolve();
    },
  };
}

test("a read that left before a refresh does not overwrite the refresh", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await seed(page, request, run);
  const held = await holdFirstItemRead(page);
  const url = `${SLOW_PAGE}?run=${run}&via=stale`;

  const id = await pasteForId(page, url);
  await settled(request, id);
  held.ready();
  await held.wasFetched;

  await pasteOnly(page, url);
  await expect(cardTitle(page)).toHaveText(READING);
  held.release();
  await held.delivered;
  await afterTwoFrames(page);

  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  await expect(cardTitle(page)).toHaveText(REFRESHED, { timeout: 30_000 });
});

test("a Paste while the list failed to load shows its card and its row once the list loads", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  let failed = false;

  await page.route(/\/api\/items$/u, async (route) => {
    if (route.request().method() === "GET" && !failed) {
      failed = true;
      await route.abort();

      return;
    }

    await route.continue();
  });

  await page.goto("/");
  await expect(pasteField(page)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load" })).toBeVisible();

  const trace = await watchAnnouncements(page);
  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=list-failed`);

  await expect(cardTitle(page)).toHaveText(READING);
  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 30_000 });
  expect((await trace()).polite.some((text) => text.startsWith(READING))).toBe(true);

  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(rowOf(page, id)).toHaveCount(1);
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`a processing row is as tall as a one-line titled ready row at ${width} px`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(60_000);
    const run = newRunId();
    await seed(page, request, run);
    await openLibrary(page, width);

    const titled = await pasteForId(page, titledPage(`Height ${run}`));
    const ready = rowOf(page, titled);
    await expect(ready).toContainText(`Height ${run}`);
    await expect(ready.locator(".skel")).toHaveCount(0);

    const processing = await pasteForId(page, `${SLOW_PAGE}?r=${run}`);
    await expect(rowOf(page, processing).locator(".skel i")).toBeVisible();

    const height = async (id: number) =>
      Math.round((await rowOf(page, id).boundingBox())?.height ?? 0);

    const heights = { width, processing: await height(processing), ready: await height(titled) };

    await info.attach(`row-heights-${width}.json`, {
      body: JSON.stringify(heights),
      contentType: "application/json",
    });
    expect(heights.processing).toBe(heights.ready);
  });
}

test("under forced colours the skeleton bar and the icons keep a system-colour edge", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await page.emulateMedia({ forcedColors: "active" });
  await seed(page, request, run);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=forced`);
  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();

  const seen = await page.evaluate((key) => {
    const probe = document.createElement("span");
    probe.style.color = "CanvasText";
    document.body.append(probe);
    const canvasText = getComputedStyle(probe).color;
    probe.remove();

    const bar = document.querySelector(`.it[data-key="${key}"] .skel i`);
    const icon = document.querySelector(".paste .ic");

    if (bar === null || icon === null) {
      throw new Error("the skeleton or an icon is missing");
    }

    const barStyle = getComputedStyle(bar);

    return {
      canvasText,
      outlineStyle: barStyle.outlineStyle,
      outlineWidth: barStyle.outlineWidth,
      outlineColor: barStyle.outlineColor,
      stroke: getComputedStyle(icon).stroke,
    };
  }, id);

  expect(seen.outlineStyle).toBe("solid");
  expect(seen.outlineWidth).toBe("1px");
  expect(seen.outlineColor).toBe(seen.canvasText);
  expect(seen.stroke).toBe(seen.canvasText);
});
