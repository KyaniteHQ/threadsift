import { z } from "zod";

import { parseCursor as parseHighlightsCursor } from "../core/contract/highlights-page-contract.ts";
import { READ_STATES, SEARCH_MAX, SOURCES } from "../core/contract/item-contract.ts";
import { parseCursor as parseItemCursor } from "../core/contract/item-cursor.ts";
import { HttpUrlSchema } from "../core/contract/item-wire.ts";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const HighlightParamsSchema = IdParamSchema.extend({
  highlightId: z.coerce.number().int().positive(),
});

export function cursorParam<Cursor>(parse: (text: string) => Cursor | null) {
  return z
    .string()
    .transform((text, context) => {
      const cursor = parse(text);

      if (cursor === null) {
        context.addIssue({ code: "custom", message: "not a well-formed cursor" });

        return z.NEVER;
      }

      return cursor;
    })
    .optional();
}

const FILTER_FIELDS = {
  q: z.string().max(SEARCH_MAX).optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  source: z.enum(SOURCES).optional(),
};

export const ItemQuerySchema = z.object({
  ...FILTER_FIELDS,
  read: z.enum(READ_STATES).optional(),
  url: HttpUrlSchema.optional(),
  cursor: cursorParam(parseItemCursor),
});

export const HighlightsQuerySchema = z.object({
  ...FILTER_FIELDS,
  cursor: cursorParam(parseHighlightsCursor),
});
