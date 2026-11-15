import { z } from "zod";

import { WIRE_ID_MAX } from "./comment-id.ts";
import { X_QUOTES_MAX, X_REPLIES_MAX } from "./limits.ts";

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

const Count = z.number().int().nonnegative().nullable();

function threadSchemaOf<
  PostedAt extends z.ZodType<number | null>,
  Repaired extends z.ZodType<boolean | undefined>,
>(postedAt: PostedAt, repairedParent: Repaired) {
  return z.strictObject({
    post: z.strictObject({
      id: StatusIdSchema,
      author: Handle,
      text: z.string().refine((text) => text.trim() !== "", { error: "must not be empty" }),
      postedAt,
      replies: Count,
      quoted: z
        .array(
          z.strictObject({
            id: StatusIdSchema,
            author: Handle,
            text: z.string(),
            postedAt,
          }),
        )
        .max(X_QUOTES_MAX, { error: `more than ${String(X_QUOTES_MAX)} quoted posts` })
        .default([]),
    }),
    replies: z
      .array(
        z.strictObject({
          id: StatusIdSchema,
          parentId: StatusIdSchema,
          author: Handle,
          text: z.string(),
          postedAt,
          likes: Count,
          repairedParent,
        }),
      )
      .max(X_REPLIES_MAX, { error: `more than ${String(X_REPLIES_MAX)} replies` }),
  });
}

export const XThreadSchema = threadSchemaOf(WirePostedAt, z.never().optional());

export const XCliThreadSchema = XThreadSchema.extend({
  post: XThreadSchema.shape.post.extend({
    quoted: XThreadSchema.shape.post.shape.quoted.unwrap(),
  }),
  replies: z
    .array(XThreadSchema.shape.replies.element.extend({ replies: Count }))
    .max(X_REPLIES_MAX, { error: `more than ${String(X_REPLIES_MAX)} replies` }),
});

export const StoredXThreadSchema = threadSchemaOf(StoredPostedAt, z.boolean().optional());

export type XThread = z.output<typeof XThreadSchema>;

export type XQuoted = Readonly<z.output<typeof StoredXThreadSchema>["post"]["quoted"][number]>;

export type XReply = Readonly<z.output<typeof StoredXThreadSchema>["replies"][number]>;

export type XPost = Readonly<Omit<XThread["post"], "quoted">> & {
  readonly quoted: readonly XQuoted[];
};

export interface XThreadValue {
  readonly post: XPost;
  readonly replies: readonly XReply[];
}

export type XCliReply = XReply & { readonly replies: number | null };

export interface XCliThreadValue {
  readonly post: XPost;
  readonly replies: readonly XCliReply[];
}
