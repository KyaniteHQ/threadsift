import { z } from "zod";

import { WIRE_ID_MAX } from "./comment-id.ts";
import { X_REPLIES_MAX } from "./limits.ts";

const StatusId = z
  .string()
  .regex(/^[1-9]\d*$/u, { error: "must be digits only, with no leading zero" })
  .max(WIRE_ID_MAX, { error: `must be at most ${String(WIRE_ID_MAX)} digits` });

const Handle = z.string().regex(/^[A-Za-z0-9_]+$/u, {
  error: "must be the handle without @, with letters, digits and underscores only",
});

const PostedAt = z.iso
  .datetime({ offset: true, error: "must be an ISO 8601 date and time or null" })
  .transform((value) => Date.parse(value))
  .nullable();

const Count = z.number().int().nonnegative().nullable();

const Post = z.strictObject({
  id: StatusId,
  author: Handle,
  text: z.string().refine((text) => text.trim() !== "", { error: "must not be empty" }),
  postedAt: PostedAt,
  replies: Count,
});

const Reply = z.strictObject({
  id: StatusId,
  parentId: StatusId,
  author: Handle,
  text: z.string(),
  postedAt: PostedAt,
  likes: Count,
});

export const XThreadSchema = z.strictObject({
  post: Post,
  replies: z.array(Reply).max(X_REPLIES_MAX, {
    error: `more than ${String(X_REPLIES_MAX)} replies`,
  }),
});

export type XThread = z.output<typeof XThreadSchema>;

export type XReply = XThread["replies"][number];
