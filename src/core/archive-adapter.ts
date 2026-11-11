import { z } from "zod";

import { DELETED_BODY } from "./comment-filter.ts";
import { parsedJson } from "./parsed-json.ts";
import { COMMENT_FIELDS, MoreChild, type WireChild, type WireComment } from "./reddit-wire.ts";

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

const ArchivePosts = z.object({
  data: z.tuple([z.looseObject({ selftext: z.string().nullish() })]),
});

const ArchiveTree = z.object({ data: z.array(Child) });

export function redditJsonOfArchive(postText: string, treeText: string): string | null {
  const posts = parsedJson(ArchivePosts, postText);
  const tree = parsedJson(ArchiveTree, treeText);

  if (posts === null || tree === null) return null;

  const [post] = posts.data;

  return JSON.stringify([
    {
      kind: "Listing",
      data: { children: [{ kind: "t3", data: { ...post, selftext: post.selftext ?? "" } }] },
    },
    { kind: "Listing", data: { children: tree.data } },
  ]);
}
