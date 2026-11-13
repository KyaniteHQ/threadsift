import { z } from "zod";

const ItemRefSchema = z.object({ id: z.number().int(), title: z.string() }).readonly();

const TopicRefSchema = z.object({ key: z.string(), name: z.string() }).readonly();

const Shared = { id: z.number().int(), at: z.number().int() };

const Digested = {
  item: ItemRefSchema,
  topic: TopicRefSchema,
  tags: z.array(z.string()).readonly(),
};

const Merged = { from: z.string(), into: z.string(), items: z.number().int().min(0) };

export const LogEntrySchema = z.discriminatedUnion("action", [
  z.object({ ...Shared, action: z.literal("ingest"), ...Digested }).readonly(),
  z.object({ ...Shared, action: z.literal("digest"), ...Digested }).readonly(),
  z.object({ ...Shared, action: z.literal("topic"), topic: TopicRefSchema }).readonly(),
  z
    .object({
      ...Shared,
      action: z.literal("overview"),
      topic: TopicRefSchema,
      added: z.number().int().min(0),
      removed: z.number().int().min(0),
    })
    .readonly(),
  z
    .object({
      ...Shared,
      action: z.literal("related"),
      item: ItemRefSchema,
      picks: z.number().int().min(1),
    })
    .readonly(),
  z.object({ ...Shared, action: z.literal("merge"), ...Merged }).readonly(),
  z.object({ ...Shared, action: z.literal("merge-topic"), ...Merged }).readonly(),
]);

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogPageSchema = z
  .object({
    startedAt: z.number().int(),
    entries: z.array(LogEntrySchema).readonly(),
    next: z.string().nullable(),
  })
  .readonly();

export type LogPage = z.infer<typeof LogPageSchema>;

const CURSOR = /^\d{1,16}$/u;

export function parseLogCursor(text: string): number | null {
  const id = Number(text);

  return CURSOR.test(text) && Number.isSafeInteger(id) ? id : null;
}
