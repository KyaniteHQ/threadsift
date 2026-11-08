import { expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { postLinkRaw } from "./api.ts";
import { LONG_WAIT_MS, endCooldown, fetchJobOf, startCooldown } from "./github-wait.ts";
import { afterFirstClaim, claimLostLines, forgetItem } from "./ingest.ts";
import { newRunId } from "./links.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test("a runner that lost its claim while the Item waited for GitHub writes no wait over the row the other runner holds", async ({
  request,
}) => {
  const instance = mainInstance();
  const name = `lost-claim-${newRunId()}`;
  const url = `https://github.com/threadsift-e2e/${name}`;
  const until = Date.now() + LONG_WAIT_MS;

  forgetItem(url);
  startCooldown(instance, until);

  const restore = afterFirstClaim(instance, name, "attempts = attempts + 1");

  try {
    const { body } = await postLinkRaw(request, url);
    const first = fetchJobOf(instance, body.item.id);

    expect(first, "the Paste opened a fetch job").toBeDefined();

    const jobId = first?.id ?? 0;

    await expect.poll(() => claimLostLines(instance, jobId).length).toBeGreaterThan(0);
    expect(fetchJobOf(instance, body.item.id)).toMatchObject({
      id: jobId,
      state: "running",
      attempts: 1,
      wait_reason: null,
    });
    expect(fetchJobOf(instance, body.item.id)?.next_attempt_at).toBeLessThan(until);
  } finally {
    restore();
    endCooldown(instance);
    forgetItem(url);
  }
});
