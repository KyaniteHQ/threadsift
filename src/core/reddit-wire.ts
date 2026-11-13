import { z } from "zod";

import { WireCommentId } from "./comment-id.ts";

export interface WireComment {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly parent_id: string;
  readonly score?: number | null | undefined;
  readonly created_utc: number;
  readonly replies?: "" | WireListing | undefined;
}

interface WireListing {
  readonly kind: "Listing";
  readonly data: { readonly children: readonly WireChild[] };
}

export type WireChild =
  | { readonly kind: "t1"; readonly data: WireComment }
  | {
      readonly kind: "more";
      readonly data: { readonly parent_id: string; readonly children: readonly string[] };
    };

export const COMMENT_FIELDS = {
  id: WireCommentId,
  author: z.string(),
  body: z.string(),
  parent_id: z.string(),
  score: z.number().int().nullish(),
  created_utc: z.number().nonnegative(),
};

export const MoreChild = z.object({
  kind: z.literal("more"),
  data: z.object({ parent_id: z.string(), children: z.array(WireCommentId).default([]) }),
});

const Child: z.ZodType<WireChild> = z.lazy(() =>
  z.union([z.object({ kind: z.literal("t1"), data: CommentData }), MoreChild]),
);

const Listing = z.object({
  kind: z.literal("Listing"),
  data: z.object({ children: z.array(Child) }),
});

const CommentData = z.object({
  ...COMMENT_FIELDS,
  replies: z.union([z.literal(""), Listing]).optional(),
});

const PostData = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    author: z.string(),
    subreddit: z.string().min(1),
    selftext: z.string(),
    url: z
      .json()
      .optional()
      .transform((value) => z.string().safeParse(value).data ?? null),
    created_utc: z.number().nonnegative(),
    num_comments: z.number().int().nonnegative().nullish(),
  })
  .readonly();

const PostListing = z
  .object({
    kind: z.literal("Listing"),
    data: z
      .object({
        children: z
          .tuple([z.object({ kind: z.literal("t3"), data: PostData }).readonly()])
          .readonly(),
      })
      .readonly(),
  })
  .readonly();

export const ThreadJson = z.tuple([PostListing, Listing]);

export type WirePost = z.infer<typeof PostData>;
