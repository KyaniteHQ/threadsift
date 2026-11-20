import { z } from "zod";

import { READ_STATES, SOURCES } from "./item-contract.ts";

const CountedNameSchema = z.object({
  key: z.string(),
  name: z.string(),
  count: z.number().int(),
});

function counted<Key extends z.ZodType<string>>(key: Key) {
  return z.array(z.object({ key, count: z.number().int() })).readonly();
}

export const FilterCountsSchema = z.object({
  total: z.number().int(),
  unread: z.number().int(),
  sources: counted(z.enum(SOURCES)),
  reads: counted(z.enum(READ_STATES)),
  topics: z.array(CountedNameSchema).readonly(),
  tags: z.array(CountedNameSchema).readonly(),
});

export type CountedName = z.infer<typeof CountedNameSchema>;

export type FilterCounts = z.infer<typeof FilterCountsSchema>;
