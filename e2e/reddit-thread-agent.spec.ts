import { type TestInfo, expect, test } from "@playwright/test";

import { hasAiCredentials } from "./ai.ts";
import { itemOf } from "./api.ts";
import { attachJson } from "./card.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import {
  AI_WAIT,
  BIG_COMMENTS,
  CAP_BYTES,
  type ItemView,
  OVERSIZED,
  QUESTION,
  SKIP_REASON,
  agreementTree,
  bigThread,
  digestTasks,
  expectOnlyKeptSearchable,
  keptIds,
  openProvider,
  publishedIn,
  publishedThread,
  replacementTree,
  sentIn,
  submissions,
} from "./thread-agent.ts";
import { SUBREDDIT, find, marker, post, postUrl, run } from "./thread-fixtures.ts";
import { commentRows, threadJson } from "./threads.ts";

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 900_000 });

let screen: FreshScreen;

test.afterEach(async () => {
  await screen?.close();
});

function skipsAi(): boolean {
  return !hasAiCredentials() && process.env["THREADSIFT_AI_REQUIRED"] !== "true";
}

test("the agent keeps a substantive reply under an agreement-only parent, the parent shows as a not-kept stub, the Summary covers the reply, only Kept text is searchable, and a refresh keeps the selection until its Digest publishes", async ({
  browser,
}, info) => {
  test.skip(skipsAi(), SKIP_REASON);
  expect(hasAiCredentials()).toBe(true);
  screen = await openProvider(browser);

  const id = `g${run}`;
  const tag = "agent";
  const markers = ["agreeparent", "reply", "joke"].map((name) => marker(name, tag));

  const item = await publishedThread(screen, {
    id,
    tree: agreementTree(tag),
    text: `${marker("post")} ${QUESTION}`,
  });

  expect(item).toMatchObject({ status: "ready", digestOutcome: "none", community: SUBREDDIT });
  expect(item.comments.nodes).toContainEqual(
    expect.objectContaining({ kind: "comment", id: "t1_p2", parentId: "t1_p1" }),
  );
  expect(item.comments.nodes).toContainEqual({
    kind: "stub",
    id: "t1_p1",
    parentId: null,
    depth: 0,
    reason: "not-kept",
  });
  expect(item.digest?.summary).toMatch(/inode/iu);
  await expectOnlyKeptSearchable(screen, item, markers);

  const [task] = digestTasks(screen, item.id);
  const sent = sentIn(task?.inputs ?? "").comments.map(({ id: sentId }) => sentId);
  const published = publishedIn(task?.result ?? "null");

  expect(sent).toEqual(["t1_p1", "t1_p2", "t1_p3"]);
  expect(published).toContain("t1_p2");
  expect(published.every((kept) => sent.includes(kept))).toBe(true);
  expect(submissions(screen)).toMatchObject([
    { taskId: task?.id, itemId: item.id, eligible: 3, submitted: 3, omitted: 0 },
  ]);
  await attachJson(info, "agent-selection.json", JSON.stringify({ item, task }, null, 2));
  await proveRefresh(id, item, info);
});

async function refreshBehindDeferredDigest(id: string): Promise<void> {
  const restore = deferJobs(screen.fresh, "digest");

  try {
    const content = threadJson(
      post(id, `${marker("post")} ${QUESTION} Update: it still happens.`),
      replacementTree(),
    );

    const sent = await screen.context.request.post("/api/items", {
      data: { url: postUrl(id), content },
    });

    expect(sent.status()).toBe(200);
  } finally {
    restore();
  }
}

async function proveRefresh(id: string, before: Readonly<ItemView>, info: TestInfo): Promise<void> {
  const request = screen.context.request;

  await refreshBehindDeferredDigest(id);

  const pending = await itemOf(request, before.id);

  expect(pending.status).toBe("processing");
  expect(pending.comments, "the last published selection stays readable").toEqual(before.comments);
  expect(await find(request, marker("newfix"))).toEqual([]);

  for (const job of jobsOf(before.id, screen.fresh, "digest")) makeJobDue(job.id, screen.fresh);

  await sweepNow(request, screen.fresh);
  await expect
    .poll(async () => (await itemOf(request, before.id)).status, {
      timeout: AI_WAIT,
      intervals: [2000],
    })
    .toBe("ready");

  const replaced = await itemOf(request, before.id);
  const tasks = digestTasks(screen, before.id);
  const sent = sentIn(tasks.at(-1)?.inputs ?? "").comments.map(({ id: sentId }) => sentId);

  expect(tasks).toHaveLength(2);
  expect(sent).toEqual(["t1_n1", "t1_n2"]);
  expect(keptIds(replaced).every((kept) => sent.includes(kept))).toBe(true);
  expect(new Set(commentRows(screen.fresh, before.id).map((row) => row.generation)).size).toBe(1);
  expect(await find(request, marker("agreeparent", "agent"))).toEqual([]);
  await expectOnlyKeptSearchable(screen, replaced, [marker("newfix"), marker("newjoke")]);
  await attachJson(
    info,
    "agent-refresh.json",
    JSON.stringify({ before, pending, replaced }, null, 2),
  );
}

test("a comments-only thread larger than the budget sends complete JSON within 14,000 bytes, publishes only submitted ids, and logs counts that match the stored input", async ({
  browser,
}, info) => {
  test.skip(skipsAi(), SKIP_REASON);
  expect(hasAiCredentials()).toBe(true);
  screen = await openProvider(browser);

  const item = await publishedThread(screen, { id: `h${run}`, tree: bigThread(), text: "" });
  const eligible = commentRows(screen.fresh, item.id).filter((row) => row.eligible === 1);
  const [task] = digestTasks(screen, item.id);
  const inputs = task?.inputs ?? "";
  const { postText, comments } = sentIn(inputs);
  const sent = comments.map(({ id }) => id);
  const published = publishedIn(task?.result ?? "null");

  expect(item.postText).toBeNull();
  expect(eligible).toHaveLength(BIG_COMMENTS);
  expect(Buffer.byteLength(inputs)).toBeLessThanOrEqual(CAP_BYTES);
  expect(postText).toBeNull();
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.length).toBeLessThan(BIG_COMMENTS);
  expect(sent, "the oversized comment is never sent").not.toContain(`t1_b${OVERSIZED}`);
  expect(published.every((kept) => sent.includes(kept))).toBe(true);
  expect(keptIds(item).toSorted()).toEqual(published.toSorted());
  expect(submissions(screen)).toMatchObject([
    {
      taskId: task?.id,
      itemId: item.id,
      eligible: BIG_COMMENTS,
      submitted: sent.length,
      omitted: BIG_COMMENTS - sent.length,
    },
  ]);
  await attachJson(
    info,
    "agent-budget.json",
    JSON.stringify(
      { bytes: Buffer.byteLength(inputs), sent, published, submissions: submissions(screen) },
      null,
      2,
    ),
  );
});
