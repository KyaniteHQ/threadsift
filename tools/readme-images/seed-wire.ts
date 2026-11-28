import type { Comment, RedditPost, XPost, XThread } from "./seed-types.ts";

const POSTED = 1_790_000_000;

const POSTED_AT = "2026-11-20T09:14:00Z";

function wire(comments: readonly Comment[], parent: string): readonly object[] {
  return comments.map((comment) => ({
    kind: "t1",
    data: {
      id: comment.id,
      author: comment.author,
      body: comment.body,
      parent_id: parent,
      score: comment.score,
      created_utc: POSTED + 3600,
      replies:
        comment.replies === undefined
          ? ""
          : { kind: "Listing", data: { children: wire(comment.replies, `t1_${comment.id}`) } },
    },
  }));
}

export function reddit(post: Readonly<RedditPost>): string {
  const submission = {
    id: post.id,
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    selftext: post.text,
    created_utc: POSTED,
    num_comments: post.total,
    is_self: true,
  };

  return JSON.stringify([
    { kind: "Listing", data: { children: [{ kind: "t3", data: submission }] } },
    { kind: "Listing", data: { children: wire(post.comments, `t3_${post.id}`) } },
  ]);
}

const dated = (post: Readonly<XPost>) => ({
  id: post.id,
  author: post.author,
  text: post.text,
  postedAt: POSTED_AT,
  images: [],
});

export function xThread(thread: Readonly<XThread>): string {
  const { quoted = [], replies } = thread;

  return JSON.stringify({
    post: {
      ...dated(thread),
      replies: replies.length,
      quoted: quoted.map((quote) => dated(quote)),
    },
    replies: replies.map((reply) =>
      Object.assign(dated(reply), { parentId: reply.parentId, likes: reply.likes }),
    ),
  });
}
