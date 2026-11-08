import { expect, test } from "@playwright/test";

import { aiScreen, countRows, newSealingKey } from "./ai.ts";
import { configureDigest } from "./digest.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { jobsOf } from "./ingest.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import { comment, savedThread, threadJson } from "./threads.ts";

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

test("metadata that alone passes the cap fails the Digest before any Provider call and says why in the log", async ({
  browser,
}) => {
  screen = await aiScreen(browser, newSealingKey());
  await configureDigest(screen, {
    provider: "openai-compatible",
    baseUrl: "https://threadsift-digest-unreachable.invalid/v1",
    model: "unreachable",
    key: "refused-input-proof",
  });

  const id = `r${run}`;

  const { item } = await savedThread(screen.context.request, {
    url: postUrl(id),
    content: threadJson({ ...post(id, "A post."), title: "\u0001".repeat(3000) }, [
      comment("r1", "reader_a", "A comment that would have been a candidate."),
    ]),
  });

  expect(item).toMatchObject({ status: "ready", digestOutcome: "failed", digestTitle: null });
  expect(countRows(screen, "ai_tasks"), "Provider calls").toBe(0);
  expect(screen.fresh.logs()).toContain(
    `"event":"digest-input-refused","itemId":${item.id},"reason":"fixed-metadata-over-cap"`,
  );
  expect(jobsOf(item.id, screen.fresh, "digest")).toMatchObject([{ state: "done", attempts: 0 }]);
});
