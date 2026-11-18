import { z } from "zod";

import { WIRE_ID_MAX } from "./comment-id.ts";
import { X_QUOTES_MAX, X_REPLIES_MAX } from "./limits.ts";
import { WholeCount } from "./whole-count.ts";
import { onlyXImages } from "./x-images.ts";

export const StatusIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/u, { error: "must be digits only, with no leading zero" })
  .max(WIRE_ID_MAX, { error: `must be at most ${String(WIRE_ID_MAX)} digits` });

const Handle = z.string().regex(/^[A-Za-z0-9_]+$/u, {
  error: "must be the handle without @, with letters, digits and underscores only",
});

const WirePostedAt = z.iso
  .datetime({ offset: true, error: "must be an ISO 8601 date and time or null" })
  .transform((value) => Date.parse(value))
  .nullable();

const StoredPostedAt = z.number().int().nullable();

const Count = WholeCount.nullable();

const PhotoUrls = z
  .array(z.string())
  .transform((addresses) => onlyXImages(addresses))
  .default([])
  .readonly();

const PostText = z.string().refine((text) => text.trim() !== "", { error: "must not be empty" });

const NoPhotoUrls = z.array(z.never()).max(0).default([]).readonly();

function repliesArrayOf<Reply extends z.ZodType>(reply: Reply) {
  return z.array(reply).max(X_REPLIES_MAX, { error: `more than ${String(X_REPLIES_MAX)} replies` });
}

function threadSchemaOf<
  PostedAt extends z.ZodType<number | null>,
  Repaired extends z.ZodType<boolean | undefined>,
  Images extends z.ZodType<readonly string[]>,
  RootText extends z.ZodType<string>,
>(postedAt: PostedAt, repairedParent: Repaired, images: Images, rootText: RootText) {
  return z.strictObject({
    post: z.strictObject({
      id: StatusIdSchema,
      author: Handle,
      text: rootText,
      postedAt,
      replies: Count,
      images,
      quoted: z
        .array(
          z.strictObject({
            id: StatusIdSchema,
            author: Handle,
            text: z.string(),
            postedAt,
            images,
          }),
        )
        .max(X_QUOTES_MAX, { error: `more than ${String(X_QUOTES_MAX)} quoted posts` })
        .default([]),
    }),
    replies: repliesArrayOf(
      z.strictObject({
        id: StatusIdSchema,
        parentId: StatusIdSchema,
        author: Handle,
        text: z.string(),
        postedAt,
        likes: Count,
        repairedParent,
        images,
      }),
    ),
  });
}

export const XThreadSchema = threadSchemaOf(
  WirePostedAt,
  z.never().optional(),
  NoPhotoUrls,
  PostText,
);

export const XBotThreadSchema = threadSchemaOf(
  WirePostedAt,
  z.never().optional(),
  PhotoUrls,
  z.string(),
);

export const XCliThreadSchema = XBotThreadSchema.extend({
  post: XBotThreadSchema.shape.post.extend({
    quoted: XBotThreadSchema.shape.post.shape.quoted.unwrap(),
  }),
  replies: repliesArrayOf(XBotThreadSchema.shape.replies.element.extend({ replies: Count })),
});

export const StoredXThreadSchema = threadSchemaOf(
  StoredPostedAt,
  z.boolean().optional(),
  PhotoUrls,
  z.string(),
);

export type XQuoted = Readonly<z.output<typeof StoredXThreadSchema>["post"]["quoted"][number]>;

export type XReply = Readonly<z.output<typeof StoredXThreadSchema>["replies"][number]>;

export type XPost = Readonly<Omit<z.output<typeof StoredXThreadSchema>["post"], "quoted">> & {
  readonly quoted: readonly XQuoted[];
};

export interface XThreadValue {
  readonly post: XPost;
  readonly replies: readonly XReply[];
}

export type XCliReply = XReply & { readonly replies?: number | null };

export interface XCliThreadValue {
  readonly post: XPost;
  readonly replies: readonly XCliReply[];
}
