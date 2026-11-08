import { z } from "zod";

const PREFIX = "t1_";

const MAX_BYTES = 32;

export const StoredCommentId = z
  .string()
  .max(MAX_BYTES)
  .regex(/^t1_[a-z\d]+$/iu);

export const WireCommentId = z
  .string()
  .max(MAX_BYTES - PREFIX.length)
  .regex(/^[a-z\d]+$/iu);

export function storedCommentId(wireId: string): string {
  return `${PREFIX}${wireId}`;
}
