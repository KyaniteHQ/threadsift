import type { Page } from "@playwright/test";

import { TEXT } from "../../extension/lib/text.ts";
import { pause as sleep } from "../../src/core/pause.ts";
import { setFill } from "./browser.ts";
import { itemOf, seedItem } from "./instance.ts";
import { record } from "./report.ts";
import { type Run, threadUrl } from "./run-types.ts";
import type { Entry } from "./stand-in.ts";

const SWITCH_AFTER = [3, 5, 8];

const RACE_FROM_MS = -80;

const RACE_STEP_MS = 10;

const RACE_ROUNDS = 16;

const RACE_OFFSETS_MS = Array.from(
  { length: RACE_ROUNDS },
  (_, n) => RACE_FROM_MS + n * RACE_STEP_MS,
);

const REDDIT_READS: ReadonlySet<Entry["kind"]> = new Set(["thread-json", "permalink"]);

function readsOf(run: Readonly<Run>, postId: string): readonly Entry[] {
  return run.standIn.log.filter(({ postId: id, kind }) => id === postId && REDDIT_READS.has(kind));
}

async function pressTurnOff(options: Page): Promise<number> {
  await options.getByRole("button", { name: TEXT.fillTurnOff, exact: true }).click();
  await options.getByText(TEXT.fillIsOff).waitFor({ timeout: 10_000 });

  return Date.now();
}

async function waitForReads(run: Readonly<Run>, postId: string, count: number): Promise<void> {
  const started = Date.now();

  while (readsOf(run, postId).filter(({ kind }) => kind === "permalink").length < count) {
    if (Date.now() - started > 30_000) throw new Error(`the fill of ${postId} did not start`);

    // oxlint-disable-next-line eslint/no-await-in-loop -- poll the stand-in's log.
    await sleep(10);
  }
}

async function openThread(run: Readonly<Run>, postId: string): Promise<Page> {
  const tab = await run.session.context.newPage();
  await tab.goto(threadUrl(postId));

  return tab;
}

async function switchAfter(run: Readonly<Run>, round: number, requests: number): Promise<void> {
  const { options } = run.session;
  const postId = `fillturn${round}x40`;
  await setFill(options, true);

  const before = await seedItem(run.instance, postId);
  const tab = await openThread(run, postId);
  await waitForReads(run, postId, requests);

  const clickedAt = Date.now();
  const answeredAt = await pressTurnOff(options);
  await sleep(5000);

  const reads = readsOf(run, postId);
  const after = await itemOf(run.instance, postId);

  record(
    `turn off: round ${round}, switch after ${requests} requests of a 40 stub Fill`,
    reads.every(({ t }) => t <= answeredAt) &&
      after?.fillable === true &&
      after.commentCount === null,
    JSON.stringify({
      msClickToAnswer: answeredAt - clickedAt,
      requestsAfterAnswer: reads.filter(({ t }) => t > answeredAt).length,
      itemBefore: before,
      itemAfter: after,
    }),
  );
  await tab.close();
}

async function raceOnce(run: Readonly<Run>, round: number, offset: number): Promise<number> {
  const { options } = run.session;
  const postId = `fillrace${round}x6`;
  await setFill(options, true);
  await seedItem(run.instance, postId);

  const tab = await run.session.context.newPage();
  const opening = sleep(Math.max(0, offset)).then(() => tab.goto(threadUrl(postId)));
  const switching = sleep(Math.max(0, -offset)).then(() => pressTurnOff(options));
  const [, answeredAt] = await Promise.all([opening.catch(() => null), switching]);
  await sleep(3500);
  await tab.close();

  return readsOf(run, postId).filter(({ t }) => t > answeredAt).length;
}

async function raceChecks(run: Readonly<Run>): Promise<void> {
  const leaks: { offsetMs: number; requestsAfterAnswer: number }[] = [];

  for (const [round, offset] of RACE_OFFSETS_MS.entries()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one round at a time, they share the settings page.
    const after = await raceOnce(run, round, offset);

    if (after > 0) leaks.push({ offsetMs: offset, requestsAfterAnswer: after });
  }

  record(
    `turn off: a thread opened from ${-RACE_FROM_MS} ms before to ${RACE_FROM_MS + (RACE_ROUNDS - 1) * RACE_STEP_MS} ms after the switch starts no Fill (${RACE_ROUNDS} rounds)`,
    leaks.length === 0,
    JSON.stringify({ roundsWithARequestAfterTheAnswer: leaks }),
  );
}

async function inFlightCheck(run: Readonly<Run>): Promise<void> {
  const { options } = run.session;
  const postId = "fillslowx6";
  await setFill(options, true);
  await seedItem(run.instance, postId);

  const tab = await openThread(run, postId);
  await waitForReads(run, postId, 1);

  const clickedAt = Date.now();
  await pressTurnOff(options);
  await sleep(1500);

  const slow = readsOf(run, postId).find(({ kind }) => kind === "permalink");
  const closedAt = slow?.closedAt ?? null;

  record(
    "turn off: a Reddit request in flight when Fill is turned off is cancelled",
    slow?.closedEarly === true && closedAt !== null && closedAt - clickedAt < 1000,
    JSON.stringify({
      msClickToClose: closedAt === null ? null : closedAt - clickedAt,
      closedBeforeAnswer: slow?.closedEarly,
    }),
  );
  await tab.close();
}

async function controlCheck(run: Readonly<Run>): Promise<void> {
  const postId = "fillokx12";
  await setFill(run.session.options, true);
  await seedItem(run.instance, postId);

  const tab = await openThread(run, postId);
  const started = Date.now();
  let item = await itemOf(run.instance, postId);

  while (item?.fillable !== false && Date.now() - started < 40_000) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- poll the Instance until the Fill saved the thread.
    await sleep(500);
    // oxlint-disable-next-line eslint/no-await-in-loop -- poll the Instance until the Fill saved the thread.
    item = await itemOf(run.instance, postId);
  }

  record(
    "turn off: control, an uninterrupted Fill saves the thread",
    item?.fillable === false && item.commentCount?.total === 13,
    JSON.stringify({
      item,
      permalinkRequests: readsOf(run, postId).filter(({ kind }) => kind === "permalink").length,
    }),
  );
  await tab.close();
}

export async function fillChecks(run: Readonly<Run>): Promise<void> {
  for (const [index, requests] of SWITCH_AFTER.entries()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one Fill at a time, they share the settings page.
    await switchAfter(run, index + 1, requests);
  }

  await inFlightCheck(run);
  await raceChecks(run);
  await controlCheck(run);
}
