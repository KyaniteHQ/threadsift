import { z } from "zod";

const PREFIX = "t1_";

const MAX_BYTES = 32;

export const WIRE_ID_MAX = MAX_BYTES - PREFIX.length;

export const StoredCommentId = z
  .string()
  .max(MAX_BYTES)
  .regex(/^t1_[a-z\d]+$/iu);

export const WireCommentId = z
  .string()
  .max(WIRE_ID_MAX)
  .regex(/^[a-z\d]+$/iu);

export function storedCommentId(wireId: string): string {
  return `${PREFIX}${wireId}`;
}

export function wireCommentId(storedId: string): string | null {
  return storedId.startsWith(PREFIX) ? storedId.slice(PREFIX.length) : null;
}
