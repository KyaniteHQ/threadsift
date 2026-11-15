const MIB = 1024 * 1024;

const COMMENT_BYTES = 900_000;

const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ";

export const STREAM_LIMIT = 4 * MIB;

export const REDDIT_HOST = "www.reddit.com";

interface WireComment {
  readonly kind: "t1";
  readonly data: {
    readonly id: string;
    readonly author: string;
    readonly body: string;
    readonly parent_id: string;
    readonly score: number;
    readonly created_utc: number;
    readonly replies: "";
  };
}

interface WireMore {
  readonly kind: "more";
  readonly data: { readonly parent_id: string; readonly children: readonly string[] };
}

type WireChild = WireComment | WireMore;

function synthetic(bytes: number): string {
  return WORDS.repeat(Math.ceil(bytes / WORDS.length)).slice(0, bytes);
}

function comment(id: string, postId: string, body: string): WireComment {
  const data = {
    id,
    author: "synthetic_user",
    body,
    parent_id: `t3_${postId}`,
    score: 1,
    created_utc: 1_700_000_000,
    replies: "",
  } as const;

  return { kind: "t1", data };
}

function more(postId: string, children: readonly string[]): WireMore {
  return { kind: "more", data: { parent_id: `t3_${postId}`, children } };
}

function thread(postId: string, children: readonly WireChild[]) {
  const post = {
    id: postId,
    title: `Synthetic thread ${postId}`,
    author: "synthetic_op",
    subreddit: "synthetic",
    selftext: "A synthetic post made for the Chromium run.",
    is_self: true,
    url: `https://${REDDIT_HOST}/r/synthetic/comments/${postId}/synthetic_thread/`,
    created_utc: 1_700_000_000,
    num_comments: children.length,
  };

  return [
    { kind: "Listing", data: { children: [{ kind: "t3", data: post }] } },
    { kind: "Listing", data: { children } },
  ];
}

function threadOfBytes(postId: string, target: number): string {
  const count = Math.ceil(target / COMMENT_BYTES);
  const bodies = Array.from({ length: count }, () => COMMENT_BYTES);

  const build = () =>
    JSON.stringify(
      thread(
        postId,
        bodies.map((size, n) => comment(`b${n}`, postId, synthetic(size))),
      ),
    );

  const missing = target - Buffer.byteLength(build());
  bodies[count - 1] = Math.max(1, COMMENT_BYTES + missing);

  return build();
}

function visibleThread(postId: string, hidden: readonly string[]): string {
  const first = comment("a1", postId, "first visible comment");

  return JSON.stringify(thread(postId, [first, more(postId, hidden)]));
}

export function threadFor(postId: string): string | null {
  if (postId.startsWith("under")) return threadOfBytes(postId, STREAM_LIMIT - 8 * 1024);

  if (postId.startsWith("overlen")) return threadOfBytes(postId, STREAM_LIMIT + 8 * 1024);

  if (postId.startsWith("overchunk")) return threadOfBytes(postId, STREAM_LIMIT + 2 * MIB);

  if (postId.startsWith("stubover")) return visibleThread(postId, ["s1"]);

  if (!postId.startsWith("fill")) return null;

  const count = Number(/x(?<count>\d+)$/u.exec(postId)?.groups?.["count"] ?? "30");

  return visibleThread(
    postId,
    Array.from({ length: count }, (_, n) => `h${n + 1}`),
  );
}

export function permalinkFor(postId: string, commentId: string): string {
  if (postId.startsWith("stubover")) return threadOfBytes(postId, STREAM_LIMIT + 2 * MIB);

  return JSON.stringify(
    thread(postId, [comment(commentId, postId, `synthetic reply ${commentId}`)]),
  );
}

const PAGE_TEXT = Array.from(
  { length: 40 },
  (_, n) =>
    `Sentence ${n + 1} of the synthetic post explains one more small fact about the same made up subject.`,
).join(" ");

export function pageFor(postId: string): string {
  return `<!doctype html><html><head><title>Synthetic thread ${postId} : r/synthetic</title></head><body><main><article><h1>Synthetic thread ${postId}</h1><p>${PAGE_TEXT}</p><p>${PAGE_TEXT}</p></article></main></body></html>`;
}

export const PAGE_MARKDOWN = PAGE_TEXT;
