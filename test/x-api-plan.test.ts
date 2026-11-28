import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type PlanFacts, nextRequest } from "../src/features/x/core/x-api-plan.ts";

const ROOT = "1900000000000000100";

const CONVERSATION = ROOT;

const POSTED_AT = Date.parse("2024-03-05T06:07:08.900Z");

const SEARCH_START = "2024-03-05T06:07:08Z";

const ENOUGH = 10_000_000;

const started: PlanFacts = {
  statusId: ROOT,
  root: null,
  quoteToExpand: null,
  quoteLookups: 0,
  searches: [],
  replies: 0,
};

function withRoot(replyCount: number, facts: Partial<PlanFacts> = {}): PlanFacts {
  return {
    ...started,
    root: { conversationId: CONVERSATION, author: "reader_one", replyCount, postedAt: POSTED_AT },
    ...facts,
  };
}

function requestOf(facts: PlanFacts, left = ENOUGH) {
  const next = nextRequest(facts, left);

  assert.equal(next.kind, "request");

  return next.request;
}

function queryOf(path: string): URLSearchParams {
  return new URL(path, "https://api.test").searchParams;
}

describe("the X API request plan reads the post, its quote chain to 5, the author's thread and the replies in a few pages of at most 100 from the post's time on, within the money left", () => {
  it("starts with a lookup of the post that bills at most 4 posts and 4 users", () => {
    const root = requestOf(started);

    assert.equal(new URL(root.path, "https://api.test").pathname, `/2/tweets/${ROOT}`);
    assert.deepEqual([root.step, root.worst], ["root", { posts: 4, users: 4 }]);
    assert.match(queryOf(root.path).get("expansions") ?? "", /referenced_tweets\.id\.author_id/u);
  });

  it("sends no lookup whose worst case passes the money left", () => {
    assert.deepEqual(nextRequest(started, 59_999), { kind: "over-limit" });
    assert.equal(nextRequest(started, 60_000).kind, "request");
  });

  it("looks up the last quoted post while the chain holds fewer than 5, at most 4 times", () => {
    const quote = requestOf(withRoot(0, { quoteToExpand: "1800" }));

    assert.equal(new URL(quote.path, "https://api.test").pathname, "/2/tweets/1800");
    assert.equal(quote.step, "quote");
    assert.equal(requestOf(withRoot(0, { quoteToExpand: "1800", quoteLookups: 3 })).step, "quote");
    assert.deepEqual(nextRequest(withRoot(0, { quoteToExpand: "1800", quoteLookups: 4 }), ENOUGH), {
      kind: "done",
    });
  });

  it("makes no search for a post without replies", () => {
    assert.deepEqual(nextRequest(withRoot(0), ENOUGH), { kind: "done" });
  });

  it("makes no search for a link to a reply, because a search of its conversation returns the whole conversation", () => {
    const reply = withRoot(30, {
      root: {
        conversationId: "1900000000000000050",
        author: "reader_one",
        replyCount: 30,
        postedAt: POSTED_AT,
      },
    });

    assert.deepEqual(nextRequest(reply, ENOUGH), { kind: "done" });
  });

  it("reads a small conversation in one page of 100, with its authors, and a second page when X has more", () => {
    const first = requestOf(withRoot(30));
    const query = queryOf(first.path);

    assert.equal(new URL(first.path, "https://api.test").pathname, "/2/tweets/search/all");
    assert.deepEqual(
      [query.get("query"), query.get("start_time"), query.get("max_results"), first.worst],
      [`conversation_id:${CONVERSATION}`, SEARCH_START, "100", { posts: 100, users: 100 }],
    );

    const second = requestOf(
      withRoot(30, {
        searches: [{ step: "replies", minLikes: null, nextToken: "next-1" }],
        replies: 20,
      }),
    );

    assert.deepEqual(
      [queryOf(second.path).get("pagination_token"), queryOf(second.path).get("start_time")],
      ["next-1", SEARCH_START],
    );
    assert.deepEqual(
      nextRequest(
        withRoot(30, {
          searches: [
            { step: "replies", minLikes: null, nextToken: "next-1" },
            { step: "replies", minLikes: null, nextToken: "next-2" },
          ],
          replies: 30,
        }),
        ENOUGH,
      ),
      { kind: "done" },
    );
  });

  it("fits the page to the money left, and stops when fewer than 10 posts fit", () => {
    assert.equal(queryOf(requestOf(withRoot(30), 300_000).path).get("max_results"), "20");
    assert.deepEqual(nextRequest(withRoot(30), 149_999), { kind: "over-limit" });
  });

  it("reads a large conversation as the author's thread, then the replies with at least 100, 10 and 1 likes, until 40 replies are held", () => {
    const author = requestOf(withRoot(465));

    assert.deepEqual(
      [
        author.step,
        queryOf(author.path).get("query"),
        queryOf(author.path).get("start_time"),
        author.worst,
      ],
      [
        "author",
        `conversation_id:${CONVERSATION} from:reader_one`,
        SEARCH_START,
        { posts: 100, users: 0 },
      ],
    );

    const afterAuthor = { step: "author", minLikes: null, nextToken: null } as const;
    const ladder = [0, 1, 2].map((done) =>
      queryOf(
        requestOf(
          withRoot(465, {
            searches: [
              afterAuthor,
              ...[100, 10, 1]
                .slice(0, done)
                .map((likes) => ({ step: "replies", minLikes: likes, nextToken: null }) as const),
            ],
            replies: 5 * done,
          }),
        ).path,
      ).get("query"),
    );

    assert.deepEqual(
      ladder,
      [100, 10, 1].map(
        (likes) => `conversation_id:${CONVERSATION} -from:reader_one min_likes:${String(likes)}`,
      ),
    );
    assert.deepEqual(
      nextRequest(
        withRoot(465, {
          searches: [afterAuthor, { step: "replies", minLikes: 100, nextToken: "more" }],
          replies: 40,
        }),
        ENOUGH,
      ),
      { kind: "done" },
    );
  });
});
