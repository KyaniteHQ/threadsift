import { utf8Length } from "../src/core/contract/encoding.ts";
import type { Json } from "./instance.ts";

export const POST_ID = "1000000000000000001";

export const X_LINK = `https://x.com/someone/status/${POST_ID}`;

export const SQLITE_FACT =
  "Run sqlite3 app.db '.backup copy.db' while writers are busy, then open copy.db and run PRAGMA integrity_check before you trust it.";

export const SECOND_FACT =
  "The same command works from the Python module as connection.backup(target), which copies page by page without locking writers out.";

type Reply = {
  readonly id: string;
  readonly parentId: string;
  readonly author: string;
  readonly text: string;
  readonly postedAt: string | null;
  readonly likes: number | null;
};

export const reply = (
  id: bigint,
  parentId: string | bigint,
  fields: Partial<Reply> = {},
): Reply => ({
  id: String(id),
  parentId: String(parentId),
  author: "bob",
  text: SQLITE_FACT,
  postedAt: "2026-03-04T10:00:00Z",
  likes: 3,
  ...fields,
});

export const thread = (replies: readonly Reply[], post: Record<string, string> = {}) => ({
  post: {
    id: POST_ID,
    author: "someone",
    text: "How do you back up a SQLite file while the app is writing to it?\n\nA plain copy tore a page last week.",
    postedAt: "2026-03-04T09:00:00Z",
    replies: replies.length,
    ...post,
  },
  replies,
});

export const authored = (postId = POST_ID): ReturnType<typeof thread> =>
  thread(
    [
      reply(1000000000000000011n, postId, { postedAt: "2026-03-04T10:05:00Z", likes: 12 }),
      reply(1000000000000000012n, 1000000000000000011n, {
        author: "Someone",
        text: SECOND_FACT,
        postedAt: "2026-03-04T10:10:00Z",
        likes: null,
      }),
      reply(1000000000000000013n, postId, {
        author: "carol",
        text: "lol",
        postedAt: "2026-03-04T10:01:00Z",
      }),
      reply(1000000000000000014n, postId, {
        author: "AutoModerator",
        text: "Remember the rules of the community.",
        postedAt: "2026-03-04T10:02:00Z",
      }),
      reply(1000000000000000015n, postId, { author: "dave", text: "", postedAt: null }),
      reply(1000000000000000016n, 1000000000000000012n, {
        author: "erin",
        postedAt: null,
        likes: 0,
      }),
    ],
    { id: postId },
  );

export const CUT_LINE =
  "\n\nThe end of the post, author follow-up posts and quoted posts were not saved.";

export const ROOM = 1_000_000 - utf8Length(CUT_LINE);

export const LEFT_OUT = "LEFT-OUT-FOLLOW-UP";

const QUOTE_ID = "1000000000000000100";

export const QUOTED_BLOCK = `\n\n> [@carol \u00B7 2026-03-04 08:00 UTC](https://x.com/carol/status/${QUOTE_ID})\n>\n> q`;

export const CUT_CASES = [
  { name: "ASCII", text: "a".repeat(999_999), root: "a".repeat(ROOM) },
  {
    name: "3-byte characters",
    text: "\u20AC".repeat(333_333),
    root: "\u20AC".repeat(Math.floor(ROOM / 3)),
  },
  {
    name: "4-byte characters",
    text: "\u{1F600}".repeat(249_999),
    root: "\u{1F600}".repeat(Math.floor(ROOM / 4)),
  },
  {
    name: "a cut inside a link",
    text: `${"a".repeat(999_000)} https://example.com/${"p".repeat(978)}`,
    root: "a".repeat(999_000),
  },
  { name: "blank edges", text: `${" ".repeat(999_998)}X`, root: "X" },
];

export const withQuote = (value: ReturnType<typeof thread>): Json => ({
  ...value,
  post: {
    ...value.post,
    quoted: [{ id: QUOTE_ID, author: "carol", text: "q", postedAt: "2026-03-04T08:00:00Z" }],
  },
});
