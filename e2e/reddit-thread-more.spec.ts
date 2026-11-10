import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  type Node,
  comment,
  generationOf,
  more,
  savedThread,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const POST_ID = `mx${run}`;

const THREAD = post(POST_ID, "A post body that the answers belong to.");

const StoredNode = z.array(
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    depth: z.number(),
    kind: z.string(),
  }),
);

function answer(root: Node, parent: string): string {
  return threadJson(THREAD, [root], parent);
}

function storedTreeOf(itemId: number) {
  return mainInstance().query(
    `SELECT id, parent_id AS parentId, depth, kind FROM reddit_comments WHERE item_id = ${itemId} AND generation = (SELECT generation FROM items WHERE id = ${itemId}) ORDER BY position`,
    StoredNode,
  );
}

const MAIN = threadJson(THREAD, [
  comment("c1", "reader_a", "The first comment explains the setup in two sentences.", [
    more("m1", "m2", "m3"),
  ]),
  comment("c2", "reader_b", "The second comment starts a long chain of replies.", [
    comment("p1", "reader_c", "The chain reaches the depth Reddit cuts at.", [more()]),
  ]),
  more("t1x", "t2x"),
]);

const FIRST_HIDDEN = answer(
  comment("m1", "reader_d", "The first hidden reply names the command that worked.", [
    comment("m1a", "reader_e", "A reply under the first hidden reply."),
    more("n1"),
  ]),
  "t1_c1",
);

const SECOND_HIDDEN = answer(
  comment("m2", "reader_f", "The second hidden reply links the upstream issue."),
  "t1_c1",
);

const NESTED = answer(
  comment("n1", "reader_g", "The reply behind the stub inside the first hidden reply."),
  "t1_m1",
);

const CONTINUED = answer(
  comment("p1", "reader_c", "The chain reaches the depth Reddit cuts at.", [
    comment("q1", "reader_h", "The first reply below the cut.", [
      comment("q2", "reader_i", "The second reply below the cut."),
    ]),
  ]),
  "t1_c2",
);

const TOP_LEVEL = answer(
  comment("t1x", "reader_j", "A top-level reply that sat behind the last stub."),
  `t3_${POST_ID}`,
);

const NOTHING_LEFT = threadJson(THREAD, [], "t1_c1");

const BEFORE = [
  { id: "t1_c1", parentId: null, depth: 0, kind: "comment" },
  { id: "more_1", parentId: "t1_c1", depth: 1, kind: "more" },
  { id: "t1_c2", parentId: null, depth: 0, kind: "comment" },
  { id: "t1_p1", parentId: "t1_c2", depth: 1, kind: "comment" },
  { id: "more_4", parentId: "t1_p1", depth: 2, kind: "more" },
  { id: "more_5", parentId: null, depth: 0, kind: "more" },
];

const AFTER = [
  { id: "t1_c1", parentId: null, depth: 0, kind: "comment" },
  { id: "t1_m1", parentId: "t1_c1", depth: 1, kind: "comment" },
  { id: "t1_m1a", parentId: "t1_m1", depth: 2, kind: "comment" },
  { id: "t1_n1", parentId: "t1_m1", depth: 2, kind: "comment" },
  { id: "t1_m2", parentId: "t1_c1", depth: 1, kind: "comment" },
  { id: "more_5", parentId: "t1_c1", depth: 1, kind: "more" },
  { id: "t1_c2", parentId: null, depth: 0, kind: "comment" },
  { id: "t1_p1", parentId: "t1_c2", depth: 1, kind: "comment" },
  { id: "t1_q1", parentId: "t1_p1", depth: 2, kind: "comment" },
  { id: "t1_q2", parentId: "t1_q1", depth: 3, kind: "comment" },
  { id: "t1_t1x", parentId: null, depth: 0, kind: "comment" },
  { id: "more_11", parentId: null, depth: 0, kind: "more" },
];

test("a thread saved with its more stubs is saved again with the answers behind them, which fill each stub in place, follow the stubs they hold, and leave a stub for the reply that was not sent", async ({
  request,
}) => {
  const url = postUrl(POST_ID);

  const first = await savedThread(request, { url, content: MAIN, digest: AUTHORED_DIGEST });

  expect(first.status).toBe(201);
  expect(storedTreeOf(first.item.id)).toEqual(BEFORE);

  const second = await savedThread(request, {
    url,
    content: [MAIN, FIRST_HIDDEN, SECOND_HIDDEN, NESTED, CONTINUED, NOTHING_LEFT, TOP_LEVEL],
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_n1", "t1_q2", "t1_t1x"] },
  });

  expect(second.status).toBe(200);
  expect(second.item.id).toBe(first.item.id);
  expect(generationOf(mainInstance(), second.item.id)).toBe(2);
  expect(storedTreeOf(second.item.id)).toEqual(AFTER);
  expect(second.item.comments).toMatchObject({ reported: 142, received: 10, kept: 3 });
  expect(second.item.comments.nodes).toMatchObject([
    { kind: "stub", id: "t1_c1", parentId: null, depth: 0 },
    { kind: "stub", id: "t1_m1", parentId: "t1_c1", depth: 1 },
    { kind: "comment", id: "t1_n1", parentId: "t1_m1", depth: 2, author: "reader_g" },
    { kind: "more", id: "more_5", parentId: "t1_c1", depth: 1 },
    { kind: "stub", id: "t1_c2", parentId: null, depth: 0 },
    { kind: "stub", id: "t1_p1", parentId: "t1_c2", depth: 1 },
    { kind: "stub", id: "t1_q1", parentId: "t1_p1", depth: 2 },
    { kind: "comment", id: "t1_q2", parentId: "t1_q1", depth: 3, author: "reader_i" },
    { kind: "comment", id: "t1_t1x", parentId: null, depth: 0, author: "reader_j" },
    { kind: "more", id: "more_11", parentId: null, depth: 0 },
  ]);
});

test("a comment link takes the answers behind the stubs under its comment", async ({ request }) => {
  const id = `my${run}`;
  const tree = post(id, "The post that holds the saved comment.");

  const { item } = await savedThread(request, {
    url: `${postUrl(id)}rc1/`,
    content: [
      threadJson(tree, [
        comment("rc1", "reader_k", "The saved comment, with replies behind a stub.", [
          comment("d1", "reader_l", "A reply that arrived with the comment.", [more("d2")]),
        ]),
      ]),
      threadJson(tree, [comment("d2", "reader_m", "The reply that sat behind the stub.")], "t1_d1"),
    ],
  });

  expect(item).toMatchObject({ kind: "reddit-comment", author: "reader_k" });
  expect(storedTreeOf(item.id)).toEqual([
    { id: "t1_d1", parentId: null, depth: 0, kind: "comment" },
    { id: "t1_d2", parentId: "t1_d1", depth: 1, kind: "comment" },
  ]);
});
