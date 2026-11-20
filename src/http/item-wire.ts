import { z } from "zod";

import { CommentCountSchema, CommentsViewSchema } from "../core/comment-view.ts";
import { ReaderDigestSchema } from "../core/digest-schema.ts";
import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { HighlightsViewSchema } from "../core/highlight-contract.ts";
import {
  DIGEST_OUTCOMES,
  KINDS,
  READ_STATES,
  SOURCES,
  WAIT_REASONS,
  X_READ_NOTES,
} from "../core/kinds.ts";
import { NoteViewSchema } from "../core/note-contract.ts";
import { RelatedSchema } from "../core/related-contract.ts";
import { withShownStatus } from "../core/shown-status.ts";
import { ItemImageSchema, SizedImageSchema } from "./item-image.ts";

export const HttpUrlSchema = z.url({ protocol: /^https?$/u });

export const WaitSchema = z.object({ reason: z.enum(WAIT_REASONS), retryAt: z.number().int() });

const ItemBaseSchema = z.object({
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

const RepositorySchema = z.object({
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  language: z.string().nullable(),
  license: z.string().nullable(),
  topics: z.array(z.string()).readonly(),
  pushedAt: z.number().int().nullable(),
});

export const ItemSchema = withShownStatus(ItemBaseSchema);

export const ItemDetailSchema = withShownStatus(
  ItemBaseSchema.extend({
    postedAt: z.number().int().nullable(),
    postText: z.string().nullable(),
    digest: ReaderDigestSchema.nullable(),
    repository: RepositorySchema.nullable(),
    images: z.array(SizedImageSchema).readonly(),
    link: HttpUrlSchema.nullable(),
    comments: CommentsViewSchema,
    highlights: HighlightsViewSchema,
    note: NoteViewSchema,
    related: RelatedSchema,
  }),
);
