import { z } from "zod";

import { CommentsViewSchema } from "../core/contract/comment-view.ts";
import { ReaderDigestSchema } from "../core/contract/digest-schema.ts";
import { HighlightsViewSchema } from "../core/contract/highlight-contract.ts";
import { NoteViewSchema } from "../core/contract/note-contract.ts";
import { RelatedSchema } from "../core/contract/related-contract.ts";
import { withShownStatus } from "../core/contract/shown-status.ts";
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
