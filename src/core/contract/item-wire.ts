import { z } from "zod";

import { CommentCountSchema } from "./comment-view.ts";
import { FETCH_RESULTS } from "./fetch-results.ts";
import { DIGEST_OUTCOMES, KINDS, READ_STATES, SOURCES } from "./item-contract.ts";
import { ItemImageSchema } from "./item-image.ts";
import { WAIT_REASONS } from "./job-contract.ts";
import { withShownStatus } from "./shown-status.ts";
import { X_READ_NOTES } from "./x-read-note.ts";

export const HttpUrlSchema = z.url({ protocol: /^https?$/u });

export const WaitSchema = z.object({ reason: z.enum(WAIT_REASONS), retryAt: z.number().int() });

export const ItemBaseSchema = z.object({
  id: z.number().int(),
  source: z.enum(SOURCES),
  kind: z.enum(KINDS),
  normalizedUrl: HttpUrlSchema,
  originalUrl: HttpUrlSchema,
  savedAt: z.number().int(),
  title: z.string().nullable(),
  digestTitle: z.string().nullable(),
  digestTopic: z.string().nullable(),
  digestOutcome: z.enum(DIGEST_OUTCOMES),
  author: z.string().nullable(),
  community: z.string().nullable(),
  fetchedAt: z.number().int().nullable(),
  fetch: z.enum(FETCH_RESULTS).nullable(),
  xNote: z.enum(X_READ_NOTES).nullable(),
  readState: z.enum(READ_STATES),
  stars: z.number().int().nonnegative().nullable(),
  commentCount: CommentCountSchema.nullable(),
  wait: WaitSchema.nullable(),
  image: ItemImageSchema.nullable(),
  fillable: z.boolean(),
});

export const ItemSchema = withShownStatus(ItemBaseSchema);

export type Item = z.infer<typeof ItemSchema>;
