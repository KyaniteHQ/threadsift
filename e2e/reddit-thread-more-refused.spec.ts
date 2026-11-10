import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { itemOf } from "./api.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  more,
  savedThread,
  sendThread,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const MIB = 1024 * 1024;

const POST_ID = `q${run}`;

const THREAD = post(POST_ID, "A post whose answers are refused.");

function answerBehind(parent: string, ...tops: ReturnType<typeof comment>[]): string {
  return threadJson(THREAD, tops, parent);
}

const MAIN = threadJson(THREAD, [
  comment("c1", "reader_a", "The first comment explains the setup in two sentences.", [
    more("m1", "m2"),
  ]),
  comment("c2", "reader_b", "The second comment starts a chain of replies.", [
    comment("d1", "reader_c", "The chain reaches the depth Reddit cuts at.", [more()]),
  ]),
]);

const BEHIND_C1 = answerBehind(
  "t1_c1",
  comment("m1", "reader_d", "A reply that sat behind a stub."),
);

interface Refusal {
  readonly name: string;
  readonly content: string | readonly string[];
  readonly status: 400 | 413;
  readonly reason: string;
}

const REFUSALS: readonly Refusal[] = [
  {
    name: "an answer that no more stub names",
    content: [MAIN, answerBehind("t1_c1", comment("zz1", "a", "A reply."))],
    status: 400,
    reason: "the answer for the comment zz1 fills no more stub",
  },
  {
    name: "an answer that comes before the answer that holds its stub",
    content: [
      MAIN,
      answerBehind("t1_m1", comment("n1", "a", "A reply.")),
      answerBehind("t1_c1", comment("m1", "a", "A reply.", [more("n1")])),
    ],
    status: 400,
    reason: "the answer for the comment n1 fills no more stub",
  },
  {
    name: "the same answer twice",
    content: [MAIN, BEHIND_C1, BEHIND_C1],
    status: 400,
    reason: "the answer for the comment m1 fills no more stub",
  },
  {
    name: "an answer for another post",
    content: [
      MAIN,
      threadJson(post(`z${run}`, "Other."), [comment("m1", "a", "A reply.")], "t1_c1"),
    ],
    status: 400,
    reason: "not the id in the link",
  },
  {
    name: "an answer with two comments at its top",
    content: [
      MAIN,
      answerBehind("t1_c1", comment("m1", "a", "A reply."), comment("m2", "a", "A reply.")),
    ],
    status: 400,
    reason: "exactly one comment at its top",
  },
  {
    name: "an answer whose comment has another parent than its stub",
    content: [MAIN, answerBehind("t1_c2", comment("m1", "a", "A reply."))],
    status: 400,
    reason: "the parent_id of the comment m1 does not match its more stub",
  },
  {
    name: "an answer that repeats a comment id of the thread",
    content: [
      MAIN,
      answerBehind("t1_c1", comment("m1", "a", "A reply.", [comment("c2", "a", "A repeat.")])),
    ],
    status: 400,
    reason: "the comment id c2 appears twice",
  },
  {
    name: "an answer that is not JSON",
    content: [MAIN, "{not json"],
    status: 400,
    reason: "not readable",
  },
  {
    name: "an answer with a more stub that lists an id that is not a comment id",
    content: [MAIN, answerBehind("t1_c1", comment("m1", "a", "A reply.", [more("1-")]))],
    status: 400,
    reason: "comment ids are 1 to 29 letters or digits",
  },
  {
    name: "no answer at all",
    content: [],
    status: 400,
    reason: "content: a string, or 1 to 101 strings",
  },
  {
    name: "102 answers",
    content: [MAIN, ...Array.from({ length: 101 }, () => BEHIND_C1)],
    status: 400,
    reason: "content: a string, or 1 to 101 strings",
  },
  {
    name: "a second answer over 4 MiB",
    content: [MAIN, "x".repeat(4 * MIB + 1)],
    status: 413,
    reason: "longer than 4 MiB",
  },
];

const Count = z.array(z.object({ n: z.number() }));

const StoredRows = z.array(z.object({ id: z.string(), parentId: z.string().nullable() }));

function counts(): number[] {
  return mainInstance()
    .query(
      "SELECT count(*) AS n FROM items UNION ALL SELECT count(*) FROM jobs UNION ALL SELECT count(*) FROM reddit_comments UNION ALL SELECT count(*) FROM search_parts",
      Count,
    )
    .map(({ n }) => n);
}

test("a refused answer leaves the Item, its comment rows, jobs and search parts as they were", async ({
  request,
}) => {
  const { item } = await savedThread(request, {
    url: postUrl(POST_ID),
    content: MAIN,
    digest: AUTHORED_DIGEST,
  });

  async function stateOf() {
    return {
      detail: await itemOf(request, item.id),
      rows: commentRows(mainInstance(), item.id),
      parents: mainInstance().query(
        `SELECT id, parent_id AS parentId FROM reddit_comments WHERE item_id = ${item.id} ORDER BY generation, position`,
        StoredRows,
      ),
      counts: counts(),
    };
  }

  const before = await stateOf();

  for (const refusal of REFUSALS) {
    const { status, response } = await sendThread(request, {
      url: postUrl(POST_ID),
      content: refusal.content,
    });

    const { error } = z.object({ error: z.string() }).parse(await response.json());

    expect(status, refusal.name).toBe(refusal.status);
    expect(error, refusal.name).toContain(refusal.reason);
    expect(await stateOf(), `after ${refusal.name}`).toEqual(before);
  }
});
