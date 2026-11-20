import { z } from "zod";

import { CommentsViewSchema } from "../core/comment-view.ts";
import { ReaderDigestSchema } from "../core/digest-schema.ts";
import { HighlightsViewSchema } from "../core/highlight-contract.ts";
import { NoteViewSchema } from "../core/note-contract.ts";
import { RelatedSchema } from "../core/related-contract.ts";
import { withShownStatus } from "../core/shown-status.ts";
import { SizedImageSchema } from "./item-image.ts";
import { HttpUrlSchema, ItemBaseSchema } from "./item-wire.ts";

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
