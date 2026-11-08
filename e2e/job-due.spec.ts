import { type APIRequestContext, expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { fetchJobOf } from "./github-wait.ts";
import { DEFUDDLE, requireGithubBudget, useSuiteGithubToken } from "./github.ts";
import { deferJobs, forgetItem, tickNow } from "./ingest.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 300_000 });

const DUE_AFTER_MS = 60_000;
const POLL_MS = 3000;

async function pasteDueLater(request: APIRequestContext, due: number): Promise<number> {
  const restore = deferJobs(mainInstance(), "fetch", due);

  try {
    return (await postLinkRaw(request, DEFUDDLE)).body.item.id;
  } finally {
    restore();
  }
}

async function jobDoneAfterSweeps(request: APIRequestContext, itemId: number): Promise<void> {
  await expect
    .poll(
      async () => {
        await tickNow(request);

        return fetchJobOf(mainInstance(), itemId)?.state;
      },
      { timeout: DUE_AFTER_MS + 120_000, intervals: [POLL_MS] },
    )
    .toBe("done");
}

test("a fetch job stored with a future due time ignores its early queue message and a restart, and runs once it is due", async ({
  request,
}) => {
  await requireGithubBudget(2);
  await useSuiteGithubToken(request);

  const instance = mainInstance();
  const due = Date.now() + DUE_AFTER_MS;

  forgetItem(DEFUDDLE);

  const itemId = await pasteDueLater(request, due);

  expect(fetchJobOf(instance, itemId)).toMatchObject({
    state: "queued",
    attempts: 0,
    next_attempt_at: due,
  });

  instance.restart();

  const afterRestart = fetchJobOf(instance, itemId);

  expect(Date.now(), "the restart outlasted the due time, so the run proves nothing").toBeLessThan(
    due,
  );
  expect(afterRestart).toMatchObject({ state: "queued", attempts: 0, next_attempt_at: due });
  expect(await itemOf(request, itemId)).toMatchObject({ status: "processing", fetchedAt: null });

  await jobDoneAfterSweeps(request, itemId);

  const item = await settled(request, itemId);

  expect(item).toMatchObject({ status: "ready", fetch: "ok", title: "kepano/defuddle" });
  expect(item.fetchedAt ?? 0).toBeGreaterThanOrEqual(due);
  expect(fetchJobOf(instance, itemId)).toMatchObject({ attempts: 0, wait_reason: null });
  forgetItem(DEFUDDLE);
});
