import { z } from "zod";

import { WIRE_ID_MAX } from "./comment-id.ts";
import { X_REPLIES_MAX } from "./limits.ts";

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

function threadSchemaOf<PostedAt extends z.ZodType<number | null>>(postedAt: PostedAt) {
  return z.strictObject({
    post: z.strictObject({
      id: StatusIdSchema,
      author: Handle,
      text: z.string().refine((text) => text.trim() !== "", { error: "must not be empty" }),
      postedAt,
      replies: Count,
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
        }),
      )
      .max(X_REPLIES_MAX, { error: `more than ${String(X_REPLIES_MAX)} replies` }),
  });
}

export const XThreadSchema = threadSchemaOf(WirePostedAt);

export const StoredXThreadSchema = threadSchemaOf(StoredPostedAt);

export type XThread = z.output<typeof XThreadSchema>;

export type XReply = Readonly<XThread["replies"][number]>;

export interface XThreadValue {
  readonly post: Readonly<XThread["post"]>;
  readonly replies: readonly XReply[];
}
