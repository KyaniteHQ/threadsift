import { z } from "zod";

import { AiRefusalSchema } from "./ai-contract.ts";
import { SOURCES } from "./kinds.ts";

export const OVERVIEW_TEXT_MAX = 1500;

export const OVERVIEW_LINES_MAX = 5;

export const OVERVIEW_FAILURES = ["gave-up", ...AiRefusalSchema.options] as const;

const OverviewFailureSchema = z.enum(OVERVIEW_FAILURES);

export type OverviewFailure = z.infer<typeof OverviewFailureSchema>;

const BuiltFromSchema = z
  .array(
    z.object({ item: z.number().int().positive(), digest: z.number().int().positive() }).readonly(),
  )
  .readonly();

export type BuiltFrom = z.infer<typeof BuiltFromSchema>;

const CITATION = /\[(\d{1,19})\]/gu;

export function citedIds(text: string): readonly number[] {
  return [...new Set([...text.matchAll(CITATION)].map(([, id = ""]) => Number(id)))].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
}

const OverviewSchema = z
  .object({
    state: z.enum(["idle", "pending", "failed"]),
    text: z.string().nullable(),
    cited: z.array(z.object({ id: z.number().int(), title: z.string() }).readonly()).readonly(),
    builtFrom: z.number().int().min(0),
    provider: z.boolean(),
    failure: OverviewFailureSchema.nullable(),
  })
  .readonly();

export type Overview = z.infer<typeof OverviewSchema>;

const TopicItemSchema = z
  .object({
    id: z.number().int(),
    source: z.enum(SOURCES),
    title: z.string(),
    summary: z.string(),
    savedAt: z.number().int(),
    read: z.boolean(),
    inOverview: z.boolean(),
  })
  .readonly();

export type TopicItem = z.infer<typeof TopicItemSchema>;

export const TopicPageSchema = z
  .object({
    topic: z
      .object({ key: z.string(), name: z.string(), itemCount: z.number().int().min(0) })
      .readonly(),
    overview: OverviewSchema,
    items: z.array(TopicItemSchema).readonly(),
    next: z.string().nullable(),
  })
  .readonly();

export type TopicPage = z.infer<typeof TopicPageSchema>;

export const OverviewRetryResponseSchema = z.object({ overview: OverviewSchema }).readonly();
