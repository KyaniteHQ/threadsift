import { z } from "zod";

import { CommentsViewSchema } from "./comment-view.ts";
import { ReaderDigestSchema } from "./digest-schema.ts";
import { HighlightsViewSchema } from "./highlight-contract.ts";
import { SizedImageSchema } from "./item-image.ts";
import { HttpUrlSchema, ItemBaseSchema } from "./item-wire.ts";
import { NoteViewSchema } from "./note-contract.ts";
import { RelatedSchema } from "./related-contract.ts";
import { withShownStatus } from "./shown-status.ts";

const RepositorySchema = z.object({
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  language: z.string().nullable(),
  license: z.string().nullable(),
  topics: z.array(z.string()).readonly(),
  pushedAt: z.number().int().nullable(),
});

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

export type ItemDetail = z.infer<typeof ItemDetailSchema>;
