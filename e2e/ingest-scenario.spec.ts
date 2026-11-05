import { type APIRequestContext, type Page, type TestInfo, expect, test } from "@playwright/test";

import type { Item } from "../src/http/schemas.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLink, postLinkRaw, settled } from "./api.ts";
import {
  ADDED,
  type CardTrace,
  READING,
  REFRESHED,
  TIMED_OUT,
  attachStatuses,
  cardTitle,
  countListReads,
  openLibrary,
  pasteForId,
  pasteOnly,
  watchCard,
} from "./card.ts";
import { STALLED, jobsOf, storeProcessingItemWithDueJob, sweepNow } from "./ingest.ts";
import { newRunId, openButton, pasteCard, rowOf, titledPage } from "./links.ts";
import { attachScreenshot } from "./look.ts";
import { isContainerTarget } from "./target.ts";

const NARROW_WIDTH = 760;

interface Run {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly info: TestInfo;
  readonly run: string;
  readonly trace: () => Promise<CardTrace>;
  readonly shot: (name: string) => Promise<void>;
}

async function firstPaste({ page, request, info, run, trace, shot }: Run, savedId: number) {
  const first = await pasteForId(page, titledPage(`First ${run}`));

  await expect(cardTitle(page)).toHaveText(READING);
  await shot("1-reading-the-link");
  await expect(cardTitle(page)).toHaveText(ADDED);
  await shot("1-added");
  await expect(rowOf(page, first)).toContainText(`First ${run}`);
  expect((await trace()).skeleton, "the row showed its skeleton").toBe(true);
  expect((await trace()).titles).toEqual([READING, ADDED]);
  await openButton(page).click();
  await expect(rowOf(page, first).locator("a.it-open")).toBeFocused();
  await attachStatuses(request, info, "1-first-paste", [savedId, first]);
}

async function stalledBesideFast({ page, request, info, run }: Run) {
  const stalled = await pasteForId(page, `${STALLED}?run=${run}&step=2`);
  const api = (await postLinkRaw(request, titledPage(`Api ${run}`))).body.item.id;
  const apiItem = await settled(request, api);
  const stalledNow = await itemOf(request, stalled);

  expect(apiItem).toMatchObject({ status: "ready", fetch: "ok" });
  expect(stalledNow.status === "processing", "the stalled Item ended before the fast one").toBe(
    isContainerTarget(),
  );
  await attachStatuses(request, info, "2-stalled-beside-fast", [stalled, api]);

  return stalled;
}

async function tryAgain({ page, request, info, shot }: Run, stalled: number) {
  const alert = page.getByRole("alert");

  await expect(alert).toContainText(TIMED_OUT, { timeout: 30_000 });
  await expect(rowOf(page, stalled).locator(".it-fail")).toContainText(TIMED_OUT);
  await shot("3-failed");
  expect(await itemOf(request, stalled)).toMatchObject({ status: "failed", reason: "timeout" });
  await alert.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(cardTitle(page)).toHaveText(READING);
  expect((await itemOf(request, stalled)).status).toBe("processing");
  await expect(alert).toContainText(TIMED_OUT, { timeout: 30_000 });
  expect(await itemOf(request, stalled)).toMatchObject({ status: "failed", fetch: "timeout" });
  expect(jobsOf(stalled).map((job) => job.state)).toEqual(["done", "done"]);
  await attachStatuses(request, info, "3-try-again", [stalled]);
}

async function refresh({ page, request, info, shot }: Run, saved: Item) {
  await pasteOnly(page, saved.originalUrl);
  await expect(cardTitle(page)).toHaveText(REFRESHED, { timeout: 30_000 });
  await shot("4-already-saved-refreshed");
  await attachStatuses(request, info, "4-refresh", [saved.id]);
}

async function dismissedCard({ page, request, info, run }: Run) {
  const id = await pasteForId(page, `${STALLED}?run=${run}&step=5`);

  await expect(cardTitle(page)).toHaveText(READING);
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TIMED_OUT, { timeout: 30_000 });
  await attachStatuses(request, info, "5-dismissed-card", [id]);
}

test("the ingest scenario: first Paste, a stall beside a fast link, Try again, a refresh, a dismissed card, and a lost job", async ({
  page,
  request,
}, info) => {
  test.setTimeout(360_000);
  const run = newRunId();
  const saved = (await postLink(request, titledPage(`Saved before ${run}`))).body.item;
  await openLibrary(page, NARROW_WIDTH);
  const trace = await watchCard(page);
  const reads = countListReads(page);
  const readsAfterLoad = reads();
  const shot = (name: string) => attachScreenshot(page, info, name);
  const context: Run = { page, request, info, run, trace, shot };

  await firstPaste(context, saved.id);
  await tryAgain(context, await stalledBesideFast(context));
  await refresh(context, saved);
  await dismissedCard(context);
  await attachStatuses(request, info, "6-lost-job", [await loseAJob(page, request, run)]);

  expect(reads() - readsAfterLoad, "the list was read again").toBe(0);
  expect((await trace()).tops, "the first row moved while a card showed").toHaveLength(1);
});

async function loseAJob(page: Page, request: APIRequestContext, run: string) {
  if (!isContainerTarget()) {
    const id = storeProcessingItemWithDueJob(`https://example.com/${run}/due`);
    await sweepNow(request);
    expect((await settled(request, id)).status).not.toBe("processing");

    return id;
  }

  const id = await pasteForId(page, `${STALLED}?run=${run}&step=6`);
  await expect
    .poll(() => jobsOf(id).map((job) => job.state), { timeout: 10_000 })
    .toEqual(["running"]);
  mainInstance().restart();
  expect(await settled(request, id)).toMatchObject({ status: "failed", reason: "timeout" });

  return id;
}
