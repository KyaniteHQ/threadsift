import { type APIRequestContext, expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw, settled } from "./api.ts";
import { attachJson } from "./card.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import {
  FIRST_DIGEST,
  FIRST_NODES,
  FIRST_ROWS,
  firstTree,
  SUBREDDIT,
  expectKeptOnly,
  find,
  marker,
  normalized,
  post,
  postUrl,
  run,
} from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  generationOf,
  savedThread,
  sendThread,
  threadJson,
} from "./threads.ts";

const FIRST_ID = `a${run}`;

const TAG = "first";

test.describe.configure({ timeout: 300_000 });

function sendFirst(request: APIRequestContext) {
  return savedThread(request, {
    url: postUrl(FIRST_ID),
    content: threadJson(post(FIRST_ID, `${marker("post")} The post body.`), firstTree(TAG)),
    digest: FIRST_DIGEST,
  });
}

test("a Reddit thread sent with a caller Digest stores the post and comments, drops the plain-code junk, publishes only the named Kept comments with the stubs they need, and searches only what was kept", async ({
  request,
}, info) => {
  const { status, item } = await sendFirst(request);

  expect(status).toBe(201);
  expect(item).toMatchObject({
    source: "reddit",
    kind: "reddit-post",
    normalizedUrl: normalized(FIRST_ID),
    status: "ready",
    fetch: "ok",
    title: `Authored thread ${FIRST_ID}`,
    author: "author_one",
    community: SUBREDDIT,
    postText: `${marker("post")} The post body.`,
    postedAt: 1_700_000_000_000,
    digestTitle: AUTHORED_DIGEST.title,
    digestOutcome: "none",
    digest: { summary: AUTHORED_DIGEST.summary, tags: ["Notebooks"] },
  });
  expect(item.comments.nodes).toMatchObject(FIRST_NODES);
  expect(item.comments).toMatchObject({ reported: 142, received: 7, kept: 3 });
  expect(JSON.stringify(item.comments)).not.toContain(marker("dropped", TAG));
  expect(JSON.stringify(item.comments)).not.toContain(marker("unkept", TAG));
  expect(jobsOf(item.id).map((job) => [job.kind, job.state])).toEqual([["digest", "done"]]);

  const rows = commentRows(mainInstance(), item.id);
  expect(rows.map((row) => [row.id, row.kept, row.eligible, row.hasBody])).toEqual(FIRST_ROWS);
  await expectKeptOnly(request, item.id, TAG);
  await attachJson(info, "thread-detail.json", JSON.stringify(item, null, 2));
  await attachJson(info, "thread-rows.json", JSON.stringify(rows, null, 2));
});

const REPLACEMENT_DIGEST = {
  ...AUTHORED_DIGEST,
  title: "Second authored title",
  keptComments: ["t1_n1"],
};

function replacementThread(): string {
  return threadJson(post(FIRST_ID, "A replacement post body."), [
    comment("n1", "reader_l", `${marker("newkept")} One comment worth keeping.`),
    comment("n2", "reader_m", `${marker("newunkept")} Not chosen.`),
  ]);
}

function generationsOf(id: number): number[] {
  return [...new Set(commentRows(mainInstance(), id).map((row) => row.generation))];
}

async function sendBehindDeferredDigest(request: APIRequestContext) {
  const restore = deferJobs(mainInstance(), "digest");

  try {
    return await request.post("/api/items", {
      data: { url: postUrl(FIRST_ID), content: replacementThread(), digest: REPLACEMENT_DIGEST },
    });
  } finally {
    restore();
  }
}

test("a refresh replaces the selection only when its Digest publishes, and a Paste of the link alone keeps the stored thread", async ({
  request,
}, info) => {
  const instance = mainInstance();
  const { item: before } = await sendFirst(request);
  const first = generationOf(instance, before.id);

  expect((await sendBehindDeferredDigest(request)).status()).toBe(200);

  const pending = await itemOf(request, before.id);
  expect(pending).toMatchObject({ status: "processing", postText: "A replacement post body." });
  expect(pending.digestTitle).toBe(AUTHORED_DIGEST.title);
  expect(pending.comments, "the last published selection stays readable").toEqual(before.comments);
  expect(await find(request, marker("deep", TAG))).toEqual([before.id]);
  expect(await find(request, marker("newkept"))).toEqual([]);
  expect(generationsOf(before.id)).toEqual([first, first + 1]);

  for (const job of jobsOf(before.id, instance, "digest")) makeJobDue(job.id, instance);
  await sweepNow(request, instance);
  const replaced = await settled(request, before.id);

  expect(replaced.digestTitle).toBe("Second authored title");
  expect(replaced.comments).toMatchObject({ reported: 142, received: 2, kept: 1 });
  expect(replaced.comments.nodes).toMatchObject([{ kind: "comment", id: "t1_n1", depth: 0 }]);
  expect(await find(request, marker("newkept"))).toEqual([before.id]);
  expect(await find(request, marker("newunkept"))).toEqual([]);
  expect(await find(request, marker("deep", TAG))).toEqual([]);
  expect(generationsOf(before.id)).toEqual([first + 1]);

  expect((await postLinkRaw(request, postUrl(FIRST_ID))).status).toBe(200);
  const kept = await settled(request, before.id);

  expect(kept).toMatchObject({
    postText: "A replacement post body.",
    digestTitle: "Second authored title",
  });
  expect(kept.comments).toEqual(replaced.comments);
  expect(generationOf(instance, before.id)).toBe(first + 1);
  await attachJson(
    info,
    "refresh.json",
    JSON.stringify({ before, pending, replaced, kept }, null, 2),
  );
});

test("a stored thread whose Digest has not published reads its counts and its top-level more stub, and no comment body", async ({
  request,
}) => {
  const instance = mainInstance();
  const id = `n${run}`;
  const tag = "unpublished";
  const restore = deferJobs(instance, "digest");
  let sent: Awaited<ReturnType<typeof sendThread>>;

  try {
    sent = await sendThread(request, {
      url: postUrl(id),
      content: threadJson(post(id, "A body."), firstTree(tag)),
      digest: FIRST_DIGEST,
    });
  } finally {
    restore();
  }

  const { item } = SavedItemResponseSchema.parse(await sent.response.json());
  const waiting = await itemOf(request, item.id);

  expect(waiting.status).toBe("processing");
  expect(waiting.digestTitle).toBeNull();
  expect(waiting.comments).toEqual({
    reported: 142,
    received: 7,
    kept: 0,
    nodes: [{ kind: "more", id: "more_10", parentId: null, depth: 0 }],
  });
  expect(await find(request, marker("kept", tag))).toEqual([]);

  for (const job of jobsOf(item.id, instance, "digest")) makeJobDue(job.id, instance);
  await sweepNow(request, instance);

  expect((await settled(request, item.id)).comments).toMatchObject({ received: 7, kept: 3 });
});
