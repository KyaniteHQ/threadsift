import { type APIRequestContext, expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { cooldownRows, endCooldown, fetchJobOf, startCooldown } from "./github-wait.ts";
import {
  DEFUDDLE,
  deleteGithubToken,
  madeUpGithubToken,
  removeGithubToken,
  requireGithubBudget,
  useSuiteGithubToken,
  GITHUB_SETTINGS_ENDPOINT,
} from "./github.ts";
import { forgetItem } from "./ingest.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 240_000 });

const HOUR_MS = 3_600_000;
const A_DAY_MS = 24 * HOUR_MS;

test.afterEach(async ({ request }) => {
  endCooldown(mainInstance());
  forgetItem(DEFUDDLE);
  await useSuiteGithubToken(request);
});

async function expectFetched(request: APIRequestContext): Promise<void> {
  const { body } = await postLinkRaw(request, DEFUDDLE);
  const item = await settled(request, body.item.id);

  expect(item).toMatchObject({
    status: "ready",
    fetch: "ok",
    wait: null,
    title: "kepano/defuddle",
  });
}

test("saving a GitHub token ends a cooldown a day ahead, and the next Paste fetches", async ({
  request,
}) => {
  await requireGithubBudget(2, true);
  await removeGithubToken(request);
  forgetItem(DEFUDDLE);
  startCooldown(mainInstance(), Date.now() + A_DAY_MS);

  const saved = await request.put(GITHUB_SETTINGS_ENDPOINT, {
    data: { token: madeUpGithubToken("cooldown-save") },
  });

  expect(saved.status()).toBe(200);
  expect(cooldownRows(mainInstance()), "saving the token ends the cooldown").toEqual([]);

  await removeGithubToken(request);
  await expectFetched(request);
});

test("removing the GitHub token ends a cooldown a day ahead, and the next Paste fetches", async ({
  request,
}) => {
  await requireGithubBudget(2, true);
  await useSuiteGithubToken(request);
  forgetItem(DEFUDDLE);
  startCooldown(mainInstance(), Date.now() + A_DAY_MS);

  expect((await deleteGithubToken(request)).status()).toBe(200);
  expect(cooldownRows(mainInstance()), "removing the token ends the cooldown").toEqual([]);
  await expectFetched(request);
});

test("a cooldown stored a day ahead is cut to GitHub's hour when a Paste meets it, and the fetch job waits no longer than that", async ({
  request,
}) => {
  await removeGithubToken(request);
  forgetItem(DEFUDDLE);
  startCooldown(mainInstance(), Date.now() + A_DAY_MS);

  const { body } = await postLinkRaw(request, DEFUDDLE);
  const met = Date.now();

  await expect
    .poll(() => fetchJobOf(mainInstance(), body.item.id)?.wait_reason, { timeout: 60_000 })
    .not.toBeNull();

  const [until = 0] = cooldownRows(mainInstance());
  const job = fetchJobOf(mainInstance(), body.item.id);
  const item = await itemOf(request, body.item.id);

  expect(until, "the stored cooldown is still in the future").toBeGreaterThan(met);
  expect(until, "the stored cooldown is at most an hour from the Paste").toBeLessThanOrEqual(
    met + HOUR_MS,
  );
  expect(job?.next_attempt_at).toBe(until);
  expect(item.wait?.retryAt).toBe(until);
});
