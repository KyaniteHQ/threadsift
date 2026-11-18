import { z } from "zod";

import { StoredCommentId } from "./comment-id.ts";
import { READABLE_TEXT, STORED_TEXT } from "./digest-text.ts";

const KEPT_COMMENTS_MAX = 2000;

const ModelCommentId = z.string().max(32);

export const StoredDigestSchema = z.object({
  ...STORED_TEXT,
  keyPoints: z.array(z.string().trim().min(1).max(1200)).min(1).max(12).readonly(),
  keptComments: z.array(StoredCommentId).max(KEPT_COMMENTS_MAX).readonly().optional(),
});

export const DigestSchema = StoredDigestSchema.extend(READABLE_TEXT);

export const ModelDigestSchema = DigestSchema.extend({
  keptComments: z.array(ModelCommentId).max(KEPT_COMMENTS_MAX).readonly(),
});

export type Digest = z.infer<typeof DigestSchema>;

export function parseStoredDigest(stored: string): Digest {
  return StoredDigestSchema.parse(JSON.parse(stored));
}

export const ReaderDigestSchema = StoredDigestSchema.pick({
  summary: true,
  keyPoints: true,
  tags: true,
});

export type ReaderDigest = z.infer<typeof ReaderDigestSchema>;
