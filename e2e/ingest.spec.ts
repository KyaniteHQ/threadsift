import { setTimeout as sleep } from "node:timers/promises";

import { expect } from "@playwright/test";

import { agentToken, bearer, mainInstance, test } from "./access.ts";
import { getItem, itemOf, postLink, postLinkRaw, settled } from "./api.ts";
import {
  ANSWER_MS,
  HOP_DEADLINE_MS,
  STALLED,
  expireClaim,
  jobsOf,
  makeDue,
  storeProcessingItemWithDueJob,
  sweepNow,
  waitForRunning,
} from "./ingest.ts";
import { newRunId } from "./links.ts";
import { isContainerTarget } from "./target.ts";

test("a Paste answers as processing at once and the Item becomes ready without another request", async ({
  request,
  stranger,
}) => {
  const run = newRunId();
  const started = Date.now();
  const { status, body } = await postLinkRaw(request, `https://example.com/?run=${run}`);

  expect(status).toBe(201);
  expect(body.item).toMatchObject({ status: "processing", reason: null, fetch: null, title: null });
  expect(Date.now() - started).toBeLessThan(ANSWER_MS);

  const ready = await settled(request, body.item.id);
  expect(ready).toMatchObject({
    status: "ready",
    reason: null,
    fetch: "ok",
    title: "Example Domain",
  });
  expect(ready.fetchedAt).not.toBeNull();

  const viaToken = await stranger.get(`/api/items/${body.item.id}`, {
    headers: bearer(agentToken()),
  });

  expect(viaToken.status()).toBe(200);
  expect((await getItem(request, 2_000_000_000)).status).toBe(404);
});

test("two Pastes of a link whose job is queued or running leave one job row, and a later Paste adds the second", async ({
  request,
}) => {
  test.setTimeout(60_000);
  const url = `${STALLED}?run=${newRunId()}`;
  const first = await postLinkRaw(request, url);
  const second = await postLinkRaw(request, url);

  expect([first.status, second.status]).toEqual([201, 200]);
  expect(second.body.item.id).toBe(first.body.item.id);
  expect(second.body.item.status).toBe("processing");
  expect(jobsOf(first.body.item.id)).toHaveLength(1);

  const failed = await settled(request, first.body.item.id);
  expect(failed).toMatchObject({ status: "failed", reason: "timeout", fetch: "timeout" });
  expect(jobsOf(first.body.item.id)).toHaveLength(1);

  const again = await postLinkRaw(request, url);
  expect(again.status).toBe(200);
  expect(again.body.item).toMatchObject({ status: "processing", fetch: "timeout" });
  expect(jobsOf(first.body.item.id)).toHaveLength(2);

  expect(await settled(request, first.body.item.id)).toMatchObject({
    status: "failed",
    reason: "timeout",
  });
});

test("a due queued job row that has no message and no runner is run by the next sweep and its Item leaves processing", async ({
  request,
}) => {
  const url = `https://example.com/lost-${newRunId()}`;
  const id = storeProcessingItemWithDueJob(url);

  expect(await itemOf(request, id)).toMatchObject({ status: "processing", fetch: null });
  await sweepNow(request);

  const item = await settled(request, id);
  expect(item.status).toBe("ready");
  expect(item.fetch).not.toBeNull();
  expect(jobsOf(id).map((job) => job.state)).toEqual(["done"]);
});

test("a done job is not run again by a later sweep", async ({ request }) => {
  const { body } = await postLink(request, `https://example.com/?done=${newRunId()}`);
  const before = await itemOf(request, body.item.id);
  const jobs = jobsOf(body.item.id);

  expect(jobs.map((job) => job.state)).toEqual(["done"]);
  await sweepNow(request);
  await sleep(3000);

  expect(await itemOf(request, body.item.id)).toEqual(before);
  expect(jobsOf(body.item.id)).toEqual(jobs);
});

test("a second message for a job that finished while it waited does not run it again", async ({
  request,
}) => {
  test.skip(isContainerTarget(), "only a queue delivers a message for a job the loop already ran");
  test.setTimeout(60_000);
  const { body } = await postLinkRaw(request, `${STALLED}?duplicate=${newRunId()}`);
  const { id } = body.item;

  await waitForRunning(id);
  expireClaim(id);
  await sweepNow(request);

  expect(await settled(request, id)).toMatchObject({ status: "failed", reason: "timeout" });
  await sleep(3000);
  expect(jobsOf(id)).toMatchObject([{ state: "done", attempts: 0, claim_expires: null }]);
});

test("a runner whose claim was taken over writes nothing, and the Item ends with the claim's next holder", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const { body } = await postLinkRaw(request, `${STALLED}?takeover=${newRunId()}`);
  const { id } = body.item;

  await waitForRunning(id);
  mainInstance().sql(`UPDATE jobs SET attempts = attempts + 1 WHERE item_id = ${id}`);
  await sleep(HOP_DEADLINE_MS + 4000);

  expect((await itemOf(request, id)).status).toBe("processing");
  expect(jobsOf(id)).toMatchObject([{ state: "running", attempts: 1 }]);

  expireClaim(id);
  await sweepNow(request);

  expect(await settled(request, id)).toMatchObject({ status: "failed", reason: "timeout" });
  expect(jobsOf(id)).toMatchObject([{ state: "done", attempts: 2 }]);
});

const FIRST_DELAY_MS = 30_000;
const SECOND_DELAY_MS = 120_000;

function expectNextAttemptIn(id: number, delay: number, label: string): void {
  const [job] = jobsOf(id);
  const wait = (job?.next_attempt_at ?? 0) - Date.now();

  expect(job?.state, label).toBe("queued");
  expect(wait, label).toBeGreaterThan(delay - 3000);
  expect(wait, label).toBeLessThanOrEqual(delay);
}

test("an attempt that throws is retried after 30 s and then 2 minutes, and the job ends failed with gave-up", async ({
  request,
}) => {
  test.setTimeout(120_000);

  const id = storeProcessingItemWithDueJob(
    `https://example.com/damaged-${newRunId()}`,
    "not a url",
  );

  await sweepNow(request);

  await expect.poll(() => jobsOf(id)[0]?.attempts, { timeout: 20_000, intervals: [250] }).toBe(1);
  expectNextAttemptIn(id, FIRST_DELAY_MS, "after attempt 1");
  expect((await itemOf(request, id)).status).toBe("processing");

  await expect
    .poll(() => jobsOf(id)[0]?.attempts, { timeout: FIRST_DELAY_MS + 30_000, intervals: [500] })
    .toBe(2);
  expectNextAttemptIn(id, SECOND_DELAY_MS, "after attempt 2");
  expect((await itemOf(request, id)).status).toBe("processing");

  makeDue(id);
  await sweepNow(request);

  const item = await settled(request, id);

  expect(item).toMatchObject({ status: "failed", reason: "gave-up", fetch: null });
  expect(jobsOf(id)).toMatchObject([{ state: "done", attempts: 3, claim_expires: null }]);
});
