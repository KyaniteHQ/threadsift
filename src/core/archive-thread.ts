import { z } from "zod";

import { DELETED_BODY } from "./comment-filter.ts";
import type { RedditRef } from "./links.ts";
import { parsedJson } from "./parsed-json.ts";
import { checkedPost, threadOf } from "./reddit-json.ts";
import { checkedIds, redditAnswerOf, walkArchive } from "./reddit-tree.ts";
import {
  COMMENT_FIELDS,
  MoreChild,
  type WireChild,
  type WireComment,
  WirePostSchema,
} from "./reddit-wire.ts";
import type { ParsedThread } from "./thread-parse.ts";
import { refusing } from "./thread-refusal.ts";

interface ArchiveListing {
  readonly kind: "Listing";
  readonly data: { readonly children: readonly ArchiveChild[] };
}

type ArchiveChild =
  | {
      readonly kind: "t1";
      readonly data: Omit<WireComment, "replies"> & {
        readonly _meta?: Readonly<{ was_deleted_later?: boolean | null | undefined }> | undefined;
        readonly replies?: "" | ArchiveListing | undefined;
      };
    }
  | z.input<typeof MoreChild>;

const Child: z.ZodType<WireChild, ArchiveChild> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("t1"),
      data: z
        .object({
          ...COMMENT_FIELDS,
          _meta: z.object({ was_deleted_later: z.boolean().nullish() }).optional(),
          replies: z.union([z.literal(""), Replies]).optional(),
        })
        .transform(({ _meta, ...comment }) =>
          _meta?.was_deleted_later === true
            ? { ...comment, body: DELETED_BODY, author: DELETED_BODY }
            : comment,
        ),
    }),
    MoreChild,
  ]),
);

const Replies = z.object({
  kind: z.literal("Listing"),
  data: z.object({ children: z.array(Child) }),
});

const NonFinite = z.literal([Infinity, -Infinity]).transform(() => null);

const ArchivePost = z
  .looseObject({
    selftext: z.string().nullish(),
    url: z.union([z.json(), z.unknown().transform(() => null)]).optional(),
    num_comments: z.union([NonFinite, z.unknown()]).optional(),
  })
  .transform(
    (post) => WirePostSchema.safeParse({ ...post, selftext: post.selftext ?? "" }).data ?? null,
  );

const ArchivePosts = z.object({ data: z.tuple([ArchivePost]) });

const ArchiveTree = z.object({ data: z.array(Child) });

export function parseArchiveThread(
  postText: string,
  treeText: string,
  ref: Readonly<RedditRef>,
): ParsedThread | null {
  const posts = parsedJson(ArchivePosts, postText);
  const tree = parsedJson(ArchiveTree, treeText);

  if (posts === null || tree === null) return null;

  const [post] = posts.data;

  if (post === null) return null;

  const read = refusing(() => {
    const { children } = redditAnswerOf(post, tree.data, ref.postId);

    checkedPost(post);

    const walked = walkArchive(children, `t3_${post.id}`);

    checkedIds(new Set<string>(), walked);

    return threadOf(post, walked, ref);
  });

  return read.kind === "read" ? read.value : null;
}
