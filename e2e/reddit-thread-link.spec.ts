import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { itemOf, postLinkRaw } from "./api.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { SUBREDDIT, find, marker, normalized, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, MORE, comment, commentRows, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const REQUESTED = "rc1";

const COMMENT_TREE = [
  comment("a1", "reader_g", `${marker("ancestor")} An ancestor above the saved comment.`, [
    comment("rc1", "reader_h", `${marker("requested")} The saved comment itself.`, [
      comment("d1", "reader_i", "A reply that stays unkept.", [
        comment("d2", "reader_j", `${marker("grand")} A deeper reply worth keeping.`),
      ]),
      MORE,
    ]),
    comment("s1", "reader_k", `${marker("sibling")} A sibling of the saved comment.`),
  ]),
];

test("a comment link keeps the requested comment as the Item text and only its descendants as the thread", async ({
  request,
}) => {
  const id = `b${run}`;

  const { item } = await savedThread(request, {
    url: `${postUrl(id)}${REQUESTED}/`,
    content: threadJson(post(id, "The containing post."), COMMENT_TREE),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_d2", "t1_a1", "t1_s1"] },
  });

  expect(item).toMatchObject({
    kind: "reddit-comment",
    normalizedUrl: `${normalized(id)}_/${REQUESTED}/`,
    title: `Authored thread ${id}`,
    author: "reader_h",
    community: SUBREDDIT,
    postText: `${marker("requested")} The saved comment itself.`,
  });
  expect(item.comments).toMatchObject({ reported: null, received: 2, kept: 1 });
  expect(item.comments.nodes).toMatchObject([
    { kind: "stub", id: "t1_d1", parentId: null, depth: 0, reason: "not-kept" },
    { kind: "comment", id: "t1_d2", parentId: "t1_d1", depth: 1, author: "reader_j" },
    { kind: "more", id: "more_2", parentId: null, depth: 0 },
  ]);
  expect(commentRows(mainInstance(), item.id).map((row) => row.id)).toEqual([
    "t1_d1",
    "t1_d2",
    "more_2",
  ]);
  expect(await find(request, marker("grand"))).toEqual([item.id]);
  expect(await find(request, marker("requested"))).toEqual([item.id]);
  expect(await find(request, marker("ancestor"))).toEqual([]);
  expect(await find(request, marker("sibling"))).toEqual([]);
});

test("a comment link whose response starts at the requested comment is stored although its parent is not in the response", async ({
  request,
}) => {
  const id = `m${run}`;

  const { item } = await savedThread(request, {
    url: `${postUrl(id)}${REQUESTED}/`,
    content: threadJson(
      post(id, "The containing post."),
      [
        comment("rc1", "reader_h", `${marker("focused")} The saved comment itself.`, [
          comment("d1", "reader_i", `${marker("focusedreply")} A reply worth keeping.`),
          MORE,
        ]),
      ],
      "t1_unsavedparent",
    ),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_d1"] },
  });

  expect(item).toMatchObject({
    kind: "reddit-comment",
    author: "reader_h",
    postText: `${marker("focused")} The saved comment itself.`,
  });
  expect(item.comments).toMatchObject({ reported: null, received: 1, kept: 1 });
  expect(item.comments.nodes).toMatchObject([
    { kind: "comment", id: "t1_d1", parentId: null, depth: 0 },
    { kind: "more", id: "more_1", parentId: null, depth: 0 },
  ]);
  expect(await find(request, marker("focusedreply"))).toEqual([item.id]);
});

test("a post with no text still opens a Digest when it has eligible comments, and none when every comment is dropped", async ({
  request,
}) => {
  const withComments = `e${run}`;
  const withoutAny = `f${run}`;

  const opened = await savedThread(request, {
    url: postUrl(withComments),
    content: threadJson(post(withComments, ""), [
      comment("e1", "reader_o", "First-hand: it worked on a Raspberry Pi 4."),
      comment("e2", "reader_p", "this"),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_e1"] },
  });

  expect(opened.item).toMatchObject({ postText: null, digestTitle: AUTHORED_DIGEST.title });
  expect(opened.item.comments).toMatchObject({ received: 2, kept: 1 });

  const closed = await savedThread(request, {
    url: postUrl(withoutAny),
    content: threadJson(post(withoutAny, ""), [comment("f1", "reader_q", "lol")]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_f1"] },
  });

  expect(closed.item).toMatchObject({
    status: "ready",
    postText: null,
    digestTitle: null,
    digestOutcome: "none",
  });
  expect(closed.item.comments).toMatchObject({ received: 0, kept: 0, nodes: [] });
  expect(jobsOf(closed.item.id).map((job) => job.kind)).toEqual([]);
  expect(
    mainInstance().query(
      `SELECT pending_digest AS pending FROM items WHERE id = ${closed.item.id}`,
      z.array(z.object({ pending: z.string().nullable() })),
    ),
  ).toEqual([{ pending: null }]);
});

test("supplied content closes the open fetch job of the Item, so an older fetch cannot overwrite it", async ({
  request,
}) => {
  const instance = mainInstance();
  const id = `d${run}`;
  const restore = deferJobs(instance, "fetch");
  let queued: number;

  try {
    queued = (await postLinkRaw(request, postUrl(id))).body.item.id;
  } finally {
    restore();
  }

  expect(jobsOf(queued, instance, "fetch").map((job) => job.state)).toEqual(["queued"]);

  const saved = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, "Supplied before the fetch ran."), [
      comment("s1", "reader_n", "A comment kept by the caller."),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_s1"] },
  });

  expect(saved.item.id).toBe(queued);
  expect(jobsOf(queued, instance).map((job) => [job.kind, job.state])).toEqual([
    ["fetch", "done"],
    ["digest", "done"],
  ]);

  for (const job of jobsOf(queued, instance, "fetch")) makeJobDue(job.id, instance);
  await sweepNow(request, instance);

  expect(await itemOf(request, queued)).toMatchObject({
    title: `Authored thread ${id}`,
    postText: "Supplied before the fetch ran.",
    author: "author_one",
    community: SUBREDDIT,
    digestTitle: AUTHORED_DIGEST.title,
  });
  expect(jobsOf(queued, instance, "fetch").map((job) => [job.state, job.attempts])).toEqual([
    ["done", 0],
  ]);
});
