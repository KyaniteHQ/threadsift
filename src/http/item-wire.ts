import { z } from "zod";

import { CommentCountSchema } from "../core/comment-view.ts";
import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { DIGEST_OUTCOMES, KINDS, READ_STATES, SOURCES } from "../core/item-contract.ts";
import { WAIT_REASONS } from "../core/job-contract.ts";
import { withShownStatus } from "../core/shown-status.ts";
import { X_READ_NOTES } from "../core/x-read-note.ts";
import { ItemImageSchema } from "./item-image.ts";

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
