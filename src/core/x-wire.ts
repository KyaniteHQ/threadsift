import { z } from "zod";

import { X_REPLIES_MAX } from "./limits.ts";

const WIRE_ID_DIGITS = 29;

const StatusId = z
  .string()
  .regex(/^\d+$/u, { error: "must be digits only" })
  .max(WIRE_ID_DIGITS, { error: `must be at most ${String(WIRE_ID_DIGITS)} digits` });

const Handle = z
  .string()
  .min(1, { error: "must not be empty" })
  .refine((handle) => !handle.startsWith("@"), { error: "must be the handle without @" });

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
