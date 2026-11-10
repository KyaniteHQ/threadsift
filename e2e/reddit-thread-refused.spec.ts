import { type APIRequestContext, expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { errorOf, itemOf } from "./api.ts";
import { FIRST_DIGEST, firstTree, find, marker, post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  MIB,
  comment,
  commentRows,
  counts,
  postOnlyJson,
  savedThread,
  sendThread,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const POST_ID = `g${run}`;
const COMMENT_ID = `h${run}`;

const COMMENT_URL = `${postUrl(COMMENT_ID)}rc1/`;

const GOOD = threadJson(post(POST_ID, "A body."), firstTree("refused"));

interface Refusal {
  readonly name: string;
  readonly url: string;
  readonly content: string;
  readonly digest?: object;
  readonly status: 400 | 413;
  readonly reason: string;
}

function requestedTree(body: string) {
  return [comment("rc1", "reader_h", body, [comment("d1", "reader_i", "A reply.")])];
}

const REFUSALS: readonly Refusal[] = [
  {
    name: "malformed JSON",
    url: postUrl(POST_ID),
    content: "{not json",
    status: 400,
    reason: "not readable",
  },
  {
    name: "wrong shape",
    url: postUrl(POST_ID),
    content: '{"kind":"Listing"}',
    status: 400,
    reason: "not a Reddit thread",
  },
  {
    name: "only the post Listing",
    url: postUrl(POST_ID),
    content: postOnlyJson(post(POST_ID, "A body.")),
    status: 400,
    reason: "not a Reddit thread",
  },
  {
    name: "another post",
    url: postUrl(POST_ID),
    content: threadJson(post(`z${run}`, "Other."), []),
    status: 400,
    reason: "not the id in the link",
  },
  {
    name: "missing requested comment",
    url: `${postUrl(COMMENT_ID)}zz9/`,
    content: threadJson(post(COMMENT_ID, "Body."), requestedTree("The saved one.")),
    status: 400,
    reason: "is not in the JSON",
  },
  {
    name: "deleted requested comment",
    url: COMMENT_URL,
    content: threadJson(post(COMMENT_ID, "Body."), requestedTree("[deleted]")),
    status: 400,
    reason: "deleted or removed",
  },
  {
    name: "repeated comment id",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [
      comment("c1", "a", "one"),
      comment("c1", "b", "two"),
    ]),
    status: 400,
    reason: "appears twice",
  },
  {
    name: "a comment id that is not letters and digits",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [comment("bad-id", "a", "A substantive remark.")]),
    status: 400,
    reason: "comment ids are 1 to 29 letters or digits",
  },
  {
    name: "a comment id of 30 characters",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [comment("a".repeat(30), "a", "A remark.")]),
    status: 400,
    reason: "comment ids are 1 to 29 letters or digits",
  },
  {
    name: "broken parent chain",
    url: postUrl(POST_ID),
    content: GOOD.replace(`"parent_id":"t3_${POST_ID}"`, '"parent_id":"t1_nowhere"'),
    status: 400,
    reason: "does not match the tree",
  },
  {
    name: "body over 1,000,000 bytes",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [comment("big", "a", "x".repeat(1_000_001))]),
    status: 400,
    reason: "longer than 1000000 bytes",
  },
  {
    name: "a post Listing of another kind",
    url: postUrl(POST_ID),
    content: GOOD.replace('"kind":"Listing"', '"kind":"NotAListing"'),
    status: 400,
    reason: "not a Reddit thread",
  },
  {
    name: "a comment Listing of another kind",
    url: postUrl(POST_ID),
    content: GOOD.replace(
      '"kind":"Listing","data":{"children":[{"kind":"t1"',
      '"kind":"NotAListing","data":{"children":[{"kind":"t1"',
    ),
    status: 400,
    reason: "not a Reddit thread",
  },
  {
    name: "a reply Listing of another kind",
    url: postUrl(POST_ID),
    content: GOOD.replace('"replies":{"kind":"Listing"', '"replies":{"kind":"NotAListing"'),
    status: 400,
    reason: "not a Reddit thread",
  },
  {
    name: "a comment author over 4096 bytes",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [comment("c1", "a".repeat(2_000_001), "one")]),
    status: 400,
    reason: "the author of comment c1 is longer than 4096 bytes",
  },
  {
    name: "a post author over 4096 bytes",
    url: postUrl(POST_ID),
    content: threadJson({ ...post(POST_ID, "Body."), author: "a".repeat(2_000_001) }, []),
    status: 400,
    reason: "the post author is longer than 4096 bytes",
  },
  {
    name: "a body under 1,000,000 bytes whose stored row is over 1,500,000 bytes once escaped",
    url: postUrl(POST_ID),
    content: threadJson(post(POST_ID, "Body."), [comment("esc", "a", "\u0001".repeat(300_000))]),
    status: 400,
    reason: "once escaped",
  },
  {
    name: "an article link",
    url: `https://example.com/${run}/article`,
    content: GOOD,
    status: 400,
    reason: "only a Reddit post or comment link",
  },
  {
    name: "a share link",
    url: `https://www.reddit.com/r/threadsifttests/s/AbCdEf${run}`,
    content: GOOD,
    status: 400,
    reason: "only a Reddit post or comment link",
  },
  {
    name: "a Kept comment id that is not a comment id",
    url: postUrl(POST_ID),
    content: GOOD,
    digest: { ...AUTHORED_DIGEST, keptComments: ["bad"] },
    status: 400,
    reason: "keptComments",
  },
  {
    name: "content over 4 MiB",
    url: postUrl(POST_ID),
    content: "x".repeat(4 * MIB + 1),
    status: 413,
    reason: "longer than 4 MiB",
  },
  {
    name: "a request over 8 MiB",
    url: postUrl(POST_ID),
    content: "x".repeat(9 * MIB),
    status: 413,
    reason: "larger than 8 MiB",
  },
];

async function stateOf(request: APIRequestContext, ids: readonly number[]) {
  return {
    details: await Promise.all(ids.map((id) => itemOf(request, id))),
    rows: ids.map((id) => commentRows(mainInstance(), id)),
    counts: counts(mainInstance()),
  };
}

test("refused content answers 400 or 413 and leaves every Item, job, comment and search part as it was", async ({
  request,
}) => {
  const existing = await savedThread(request, {
    url: postUrl(POST_ID),
    content: GOOD,
    digest: FIRST_DIGEST,
  });

  const linked = await savedThread(request, {
    url: COMMENT_URL,
    content: threadJson(post(COMMENT_ID, "Body."), requestedTree("The saved one.")),
  });

  const ids = [existing.item.id, linked.item.id];
  const before = await stateOf(request, ids);

  for (const refusal of REFUSALS) {
    const { status, response } = await sendThread(request, refusal);
    const error = await errorOf(response);

    expect(status, refusal.name).toBe(refusal.status);
    expect(error, refusal.name).toContain(refusal.reason);
    expect(await stateOf(request, ids), `after ${refusal.name}`).toEqual(before);
  }

  expect(await find(request, marker("kept", "refused"))).toEqual([existing.item.id]);
});

test("the 64 KiB guard still holds on the other routes", async ({ request }) => {
  const { item } = await savedThread(request, {
    url: postUrl(`i${run}`),
    content: threadJson(post(`i${run}`, "A body."), []),
  });

  const refused = await request.put(`/api/items/${item.id}/read-state`, {
    data: { readState: "read", padding: "x".repeat(70_000) },
  });

  expect(refused.status()).toBe(413);
  expect((await itemOf(request, item.id)).readState).toBe("unread");
});
