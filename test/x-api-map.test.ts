import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type XApiReads,
  factsOf,
  parsedLookup,
  parsedPage,
  resourcesOf,
  rootState,
  threadOf,
} from "../src/features/x/core/x-api-map.ts";
import type { Json } from "./instance.ts";
import {
  AUTHOR,
  AUTHOR_ID,
  ROOT_ID,
  absent,
  lookup,
  photo,
  post,
  searchPage,
  user,
} from "./x-api-fixtures.ts";

const PHOTO = "https://pbs.twimg.com/media/SyntheticPhoto1.jpg";

const lookupOf = (answer: Json) => parsedLookup(JSON.stringify(answer));

const pageOf = (answer: Json) => parsedPage(JSON.stringify(answer));

const countOf = (answer: Json) => resourcesOf(JSON.stringify(answer));

function parsedOrFail<Value>(value: Value | null): Value {
  assert.notEqual(value, null);

  if (value === null) throw new Error("the answer did not parse");

  return value;
}

function reads(
  root: Json,
  {
    quotes = [],
    searches = [],
  }: Readonly<{
    quotes?: readonly Json[];
    searches?: readonly Readonly<{ step: "author" | "replies"; minLikes?: number; page: Json }>[];
  }> = {},
): XApiReads {
  return {
    statusId: ROOT_ID,
    root: parsedOrFail(lookupOf(root)),
    quoteLookups: quotes.map((answer) => parsedOrFail(lookupOf(answer))),
    searches: searches.map(({ step, minLikes = null, page }) => ({
      step,
      minLikes,
      page: parsedOrFail(pageOf(page)),
    })),
  };
}

function quoting(id: string, quotes?: string): Json {
  return post({ id, authorId: "72", conversationId: id, quotes });
}

function threadOrFail(read: XApiReads) {
  const thread = threadOf(read);

  if (thread === null) throw new Error("the answers gave no thread");

  return thread;
}

describe("the X API answers map to the thread the other X readers produce", () => {
  it("takes a long post's full text, writes its links out, drops its photo and quote links, and decodes X's escapes", () => {
    const quotedId = "1800000000000000001";
    const root = lookup(
      post({
        id: ROOT_ID,
        text: "Short cut https://t.co/aaa",
        noteText: "Tools &amp; tips: https://t.co/link1 more https://t.co/pic1 https://t.co/quo1",
        quotes: quotedId,
        mediaKeys: ["3_1"],
        urls: [
          { url: "https://t.co/link1", expanded_url: "https://example.com/guide" },
          {
            url: "https://t.co/pic1",
            expanded_url: `https://x.com/${AUTHOR}/status/${ROOT_ID}/photo/1`,
            media_key: "3_1",
          },
          {
            url: "https://t.co/quo1",
            expanded_url: `https://twitter.com/other_one/status/${quotedId}`,
          },
        ],
      }),
      {
        users: [user(AUTHOR_ID, AUTHOR), user("72", "other_one")],
        tweets: [
          post({
            id: quotedId,
            authorId: "72",
            text: "Quoted &lt;b&gt;",
            conversationId: quotedId,
          }),
        ],
        media: [photo("3_1", PHOTO)],
      },
    );

    const thread = threadOrFail(reads(root));

    assert.equal(thread.post.text, "Tools & tips: https://example.com/guide more");
    assert.deepEqual(thread.post.images, [PHOTO]);
    assert.equal(thread.post.author, AUTHOR);
    assert.equal(thread.post.postedAt, Date.parse("2026-11-20T10:00:00.000Z"));
    assert.deepEqual(
      thread.post.quoted.map(({ id, author, text }) => [id, author, text]),
      [[quotedId, "other_one", "Quoted <b>"]],
    );
  });

  it("follows the quote chain through the lookups of the quoted posts, and asks for the next level only while the chain holds fewer than 5", () => {
    const chain = ["1800000000000000005", "1800000000000000004", "1800000000000000003"];
    const others = [user("72", "other_one")];

    const first = reads(
      lookup(post({ id: ROOT_ID, quotes: chain[0] }), {
        users: [user(AUTHOR_ID, AUTHOR), ...others],
        tweets: [quoting(chain[0] ?? "", chain[1])],
      }),
    );

    assert.equal(factsOf(first).quoteToExpand, chain[0]);

    const second: XApiReads = {
      ...first,
      quoteLookups: [
        parsedOrFail(
          lookupOf(
            lookup(quoting(chain[0] ?? "", chain[1]), {
              users: others,
              tweets: [quoting(chain[1] ?? "")],
            }),
          ),
        ),
      ],
    };

    assert.deepEqual(
      threadOrFail(second).post.quoted.map(({ id }) => id),
      [chain[0], chain[1]],
    );
    assert.equal(factsOf(second).quoteToExpand, null);
    assert.equal(factsOf(second).quoteLookups, 1);
  });

  it("stops the chain at a quoted post X did not return, without a lookup of it", () => {
    const missing = "1800000000000000002";
    const read = reads({
      ...absent(missing, "resource-not-found"),
      data: post({ id: ROOT_ID, quotes: missing }),
      includes: { users: [user(AUTHOR_ID, AUTHOR)] },
    });

    assert.deepEqual(threadOrFail(read).post.quoted, []);
    assert.equal(factsOf(read).quoteToExpand, null);
  });

  it("builds the replies from the search pages: parents from replied_to, likes and reply counts, authors from the users, the root author for the author's search, and the root left out", () => {
    const followUp = "1900000000000000101";
    const answer = "1900000000000000102";
    const nested = "1900000000000000103";
    const read = reads(lookup(post({ id: ROOT_ID, replyCount: 3 })), {
      searches: [
        {
          step: "author",
          page: searchPage([
            post({ id: followUp, repliedTo: ROOT_ID, mediaKeys: ["3_2"] }),
            post({ id: ROOT_ID }),
          ]),
        },
        {
          step: "replies",
          minLikes: 10,
          page: searchPage(
            [
              post({ id: answer, authorId: "73", repliedTo: ROOT_ID, likes: 12, replyCount: 1 }),
              post({ id: nested, authorId: "74", repliedTo: answer, likes: 11 }),
              post({ id: followUp, repliedTo: ROOT_ID }),
            ],
            [user("73", "first_reader"), user("74", "second_reader")],
          ),
        },
      ],
    });

    const thread = threadOrFail(read);

    assert.equal(thread.post.replies, 3);
    assert.deepEqual(
      thread.replies.map(({ id, parentId, author, likes, replies }) => [
        id,
        parentId,
        author,
        likes,
        replies,
      ]),
      [
        [followUp, ROOT_ID, AUTHOR, 0, 0],
        [answer, ROOT_ID, "first_reader", 12, 1],
        [nested, answer, "second_reader", 11, 0],
      ],
    );
    assert.deepEqual(factsOf(read), {
      statusId: ROOT_ID,
      root: { conversationId: ROOT_ID, author: AUTHOR, replyCount: 3 },
      quoteToExpand: null,
      quoteLookups: 0,
      searches: [
        { step: "author", minLikes: null, nextToken: null },
        { step: "replies", minLikes: 10, nextToken: null },
      ],
      replies: 3,
    });
  });

  it("keeps only the replies under the post when the post itself replies inside a larger conversation", () => {
    const conversation = "1900000000000000001";
    const under = "1900000000000000104";
    const sibling = "1900000000000000105";
    const read = reads(
      lookup(
        post({ id: ROOT_ID, conversationId: conversation, repliedTo: conversation, replyCount: 1 }),
      ),
      {
        searches: [
          {
            step: "replies",
            page: searchPage(
              [
                post({
                  id: under,
                  authorId: "73",
                  conversationId: conversation,
                  repliedTo: ROOT_ID,
                }),
                post({
                  id: sibling,
                  authorId: "73",
                  conversationId: conversation,
                  repliedTo: conversation,
                }),
              ],
              [user("73", "first_reader")],
            ),
          },
        ],
      },
    );

    assert.deepEqual(
      threadOrFail(read).replies.map(({ id }) => id),
      [under],
    );
  });

  it("reads a deleted post and a protected or suspended post as absent, and refuses an answer that is not a lookup", () => {
    assert.equal(
      rootState(parsedOrFail(lookupOf(absent(ROOT_ID, "resource-not-found"))), ROOT_ID),
      "absent",
    );
    assert.equal(
      rootState(parsedOrFail(lookupOf(absent(ROOT_ID, "not-authorized-for-resource"))), ROOT_ID),
      "absent",
    );
    assert.equal(rootState(parsedOrFail(lookupOf(lookup(post({ id: ROOT_ID })))), ROOT_ID), "post");
    assert.equal(lookupOf({ data: { id: "01", text: "x", author_id: AUTHOR_ID } }), null);
    assert.equal(pageOf({ data: [] }), null);
  });

  it("counts every post and user an answer returns, in data and in includes", () => {
    assert.deepEqual(
      countOf(
        lookup(post({ id: ROOT_ID }), {
          users: [user(AUTHOR_ID, AUTHOR), user("72", "other_one")],
          tweets: [post({ id: "1800000000000000001" })],
        }),
      ),
      { posts: 2, users: 2 },
    );
    assert.deepEqual(
      countOf(searchPage([post({ id: "1" }), post({ id: "2" })], [user("73", "first_reader")])),
      { posts: 2, users: 1 },
    );
    assert.deepEqual(countOf(absent(ROOT_ID, "resource-not-found")), { posts: 0, users: 0 });
  });
});
