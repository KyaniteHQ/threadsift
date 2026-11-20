import { z } from "zod";

import type { RedditRef } from "../../../core/contract/links.ts";
import { checkedIds, redditAnswerOf, walkArchive } from "../../../core/contract/reddit-tree.ts";
import {
  COMMENT_FIELDS,
  MoreChild,
  type WireChild,
  type WireComment,
  WirePostSchema,
} from "../../../core/contract/reddit-wire.ts";
import { refusing } from "../../../core/contract/thread-refusal.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { DELETED_BODY } from "../../thread/core/comment-filter.ts";
import type { ParsedThread } from "../../thread/core/thread-parse.ts";
import { checkedPost, threadOf } from "./reddit-json.ts";

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
