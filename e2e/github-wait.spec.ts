import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

import { CARD_TITLES, WAITING, filled } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLink, settled } from "./api.ts";
import { cardTitle, openLibrary, pasteForId } from "./card.ts";
import {
  LONG_WAIT_MS,
  WAIT_REASON,
  endCooldown,
  fetchJobOf,
  queueRefusals,
  startCooldown,
  whenAt,
} from "./github-wait.ts";
import {
  DEFUDDLE,
  STALE,
  requireGithubBudget,
  storeKeptDigest,
  storeStaleRepository,
  useSuiteGithubToken,
} from "./github.ts";
import { forgetItem, makeDue, sweepNow } from "./ingest.ts";
import { newRunId, pasteCard, rowOf } from "./links.ts";
import { reader } from "./reader.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ mode: "serial", timeout: 240_000 });

const DAY_PREFIX = "on ";
const TWENTY_SEVEN_HOURS_MS = 27 * 3_600_000;

let itemId = 0;
let until = 0;
let word = "";

test.beforeAll(async ({ request }) => {
  await requireGithubBudget(2);
  await useSuiteGithubToken(request);
  forgetItem(DEFUDDLE);
  word = `zzwaiting${newRunId()}`;
  itemId = storeStaleRepository(DEFUDDLE, word);
  storeKeptDigest(itemId);
  until = Date.now() + LONG_WAIT_MS;
  startCooldown(mainInstance(), until);
});

test.afterAll(() => {
  endCooldown(mainInstance());
  forgetItem(DEFUDDLE);
});

async function expectWaitShown(page: Page): Promise<void> {
  const when = await whenAt(page, until);
  const sentence = filled(WAITING.until, { when });

  expect(when.startsWith(DAY_PREFIX), "a time 26 hours away is on another day").toBe(true);
  await expect(cardTitle(page)).toHaveText(WAITING.title);
  await expect(cardTitle(page)).not.toHaveText(CARD_TITLES.reading);
  await expect(pasteCard(page)).toContainText(sentence);
  await expect(rowOf(page, itemId).locator(".it-fail")).toHaveText(sentence);
}

async function expectJobWaitsForTheCooldown(): Promise<void> {
  await expect.poll(() => fetchJobOf(mainInstance(), itemId)?.wait_reason).toBe(WAIT_REASON);

  const waiting = fetchJobOf(mainInstance(), itemId);

  expect(waiting).toMatchObject({ state: "queued", attempts: 0, next_attempt_at: until });
  expect(
    queueRefusals(mainInstance(), waiting?.id ?? 0),
    "the queue accepted the wake-up of a wait 26 hours away",
  ).toEqual([]);
}

async function expectSavedContentKept(request: APIRequestContext): Promise<void> {
  const item = await itemOf(request, itemId);

  expect(item).toMatchObject({
    status: "processing",
    wait: { reason: WAIT_REASON, retryAt: until },
    title: STALE.title,
    fetch: "ok",
    fetchedAt: STALE.fetchedAt,
  });
  expect(item.postText).toContain(word);
  expect(item.repository).toMatchObject({ stars: STALE.stars, language: STALE.language });
  expect(item.digest?.summary).toBe("A kept summary.");
}

test("a Paste during a stored cooldown sends no request, keeps the saved repository and Digest, shows the wait in the card, the row and the API, and lets another Source run", async ({
  page,
  request,
}) => {
  await openLibrary(page);
  expect(await pasteForId(page, DEFUDDLE)).toBe(itemId);

  await expectWaitShown(page);
  await expectJobWaitsForTheCooldown();
  await expectSavedContentKept(request);

  const other = await postLink(request, `https://example.com/?threadsift-wait=${newRunId()}`);

  expect(other.body.item).toMatchObject({ status: "ready", fetch: "ok", wait: null });
  expect(fetchJobOf(mainInstance(), itemId)).toMatchObject({
    state: "queued",
    attempts: 0,
    wait_reason: WAIT_REASON,
    next_attempt_at: until,
  });
});

test("the Reader says the Item waits for GitHub and when it will try again, then says it is waiting to retry once that time has passed", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(`/items/${itemId}`);

  const note = page.locator(".rd-col .rd-note").first();
  const when = await whenAt(page, until);

  await expect(reader(page)).toBeVisible();
  await expect(note).toHaveText(filled(WAITING.until, { when }));
  await expect(reader(page)).toContainText(word);

  await page.clock.fastForward(TWENTY_SEVEN_HOURS_MS);
  await expect(note).toHaveText(WAITING.due);
  await expect(rowOf(page, itemId).locator(".it-fail")).toHaveText(WAITING.due);
});

test("the wait ends when the cooldown does: the job runs at once, the Item is fetched, and the wait is gone from the row and the API", async ({
  request,
}) => {
  endCooldown(mainInstance());
  makeDue(itemId);
  await sweepNow(request);

  const item = await settled(request, itemId);

  expect(item).toMatchObject({
    status: "ready",
    fetch: "ok",
    wait: null,
    title: "kepano/defuddle",
  });
  expect(item.postText).not.toContain(word);
  expect(fetchJobOf(mainInstance(), itemId)).toMatchObject({
    state: "done",
    attempts: 0,
    wait_reason: null,
  });
});
