import { type APIRequestContext, type Page, type TestInfo, expect, test } from "@playwright/test";

import type { Item } from "../src/http/schemas.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLink, postLinkRaw, settled } from "./api.ts";
import {
  ADDED,
  type CardTrace,
  READING,
  REFRESHED,
  TIMED_OUT,
  alertRegion,
  attachStatuses,
  cardTitle,
  countListReads,
  openLibrary,
  pasteForId,
  pasteOnly,
  watchCard,
} from "./card.ts";
import {
  STALLED,
  itemIdAt,
  jobsOf,
  storeProcessingItemWithDueJob,
  sweepNow,
  waitForRunning,
} from "./ingest.ts";
import {
  dismissButton,
  newRunId,
  pasteCard,
  pasteField,
  retryButton,
  rowOf,
  titledPage,
} from "./links.ts";
import { isContainerTarget } from "./target.ts";

const NARROW_WIDTH = 760;

interface Run {
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly info: TestInfo;
  readonly run: string;
  readonly trace: () => Promise<CardTrace>;
  readonly shot: (name: string) => Promise<void>;
  readonly attempts: Map<number, readonly number[]>;
}

function attachStep(
  { request, info, attempts }: Run,
  step: string,
  changes: Readonly<Record<number, readonly number[]>>,
): Promise<void> {
  for (const [id, made] of Object.entries(changes)) {
    attempts.set(Number(id), made);
  }

  return attachStatuses(request, info, step, attempts);
}

async function firstPaste(context: Run, savedId: number) {
  const { page, run, trace, shot } = context;
  const first = await pasteForId(page, titledPage(`First ${run}`));

  await expect(cardTitle(page)).toHaveText(READING);
  await shot("1-reading-the-link");
  await expect(cardTitle(page)).toHaveText(ADDED);
  await pasteCard(page).hover();
  await shot("1-added");
  await expect(rowOf(page, first)).toContainText(`First ${run}`);
  expect((await trace()).skeletonKeys, "the first Paste's row showed its skeleton").toContain(
    String(first),
  );
  expect((await trace()).titles).toEqual([READING, ADDED]);
  await dismissButton(page).click();
  await expect(pasteField(page)).toBeFocused();
  await attachStep(context, "1-first-paste", { [savedId]: [0], [first]: [0] });
}

async function stalledBesideFast(context: Run) {
  const { page, request, run } = context;
  const stalled = await pasteForId(page, `${STALLED}?run=${run}&step=2`);
  const api = (await postLinkRaw(request, titledPage(`Api ${run}`))).body.item.id;
  const apiItem = await settled(request, api);
  const stalledNow = await itemOf(request, stalled);

  expect(apiItem).toMatchObject({ status: "ready", fetch: "ok" });
  expect(stalledNow.status === "processing", "the stalled Item ended before the fast one").toBe(
    isContainerTarget(),
  );
  await attachStep(context, "2-stalled-beside-fast", { [stalled]: [0], [api]: [0] });

  return stalled;
}

async function tryAgain(context: Run, stalled: number) {
  const { page, request, shot } = context;
  await expect(cardTitle(page)).toHaveText(TIMED_OUT, { timeout: 30_000 });
  await pasteCard(page).hover();
  await expect(alertRegion(page)).toContainText(TIMED_OUT);
  await expect(rowOf(page, stalled).locator(".it-fail")).toContainText(TIMED_OUT);
  await shot("3-failed");
  expect(await itemOf(request, stalled)).toMatchObject({ status: "failed", reason: "timeout" });
  await retryButton(page).click();
  await expect(cardTitle(page)).toHaveText(READING);
  expect((await itemOf(request, stalled)).status).toBe("processing");
  await expect(cardTitle(page)).toHaveText(TIMED_OUT, { timeout: 30_000 });
  expect(await itemOf(request, stalled)).toMatchObject({ status: "failed", fetch: "timeout" });
  expect(jobsOf(stalled).map((job) => job.state)).toEqual(["done", "done"]);
  await attachStep(context, "3-try-again", { [stalled]: [0, 0] });
}

async function refresh(context: Run, saved: Item) {
  const { page, shot } = context;
  await pasteOnly(page, saved.originalUrl);
  await expect(cardTitle(page)).toHaveText(REFRESHED, { timeout: 30_000 });
  await shot("4-already-saved-refreshed");
  await attachStep(context, "4-refresh", { [saved.id]: [0, 0] });
}

async function dismissedCard(context: Run) {
  const { page, run } = context;
  const id = await pasteForId(page, `${STALLED}?run=${run}&step=5`);

  await expect(cardTitle(page)).toHaveText(READING);
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TIMED_OUT, { timeout: 30_000 });
  await attachStep(context, "5-dismissed-card", { [id]: [0] });
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

  const shot = async (name: string) => {
    const file = info.outputPath(`${name}.png`);
    await page.screenshot({ path: file });
    await info.attach(name, { path: file, contentType: "image/png" });
  };

  const context: Run = { page, request, info, run, trace, shot, attempts: new Map() };

  await firstPaste(context, saved.id);
  await tryAgain(context, await stalledBesideFast(context));
  await refresh(context, saved);
  await dismissedCard(context);
  const lost = await loseAJob(context);
  await attachStep(context, "6-lost-job", { [lost]: [isContainerTarget() ? 1 : 0] });

  reads.expectNoNewReads();
  expect((await trace()).overlaps, "the card covered a list row").toBe(0);
});

async function loseAJob({ page, request, run }: Run) {
  if (!isContainerTarget()) {
    const id = storeProcessingItemWithDueJob(`https://example.com/${run}/due`);
    await sweepNow(request);
    expect((await settled(request, id)).status).not.toBe("processing");

    return id;
  }

  const id = await pasteForId(page, `${STALLED}?run=${run}&step=6`);
  await waitForRunning(id);
  mainInstance().restart();

  const item = await settled(request, id);
  expect(item).toMatchObject({ status: "failed", reason: "timeout" });
  expect(itemIdAt(item.normalizedUrl), "the restart ran the same Item, not a new Paste").toBe(id);
  expect(jobsOf(id)).toEqual([expect.objectContaining({ state: "done", attempts: 1 })]);

  return id;
}
