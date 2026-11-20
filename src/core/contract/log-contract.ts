import { z } from "zod";

import { LOG_ACTIONS, LOG } from "./log-actions.ts";

const FIRST_SCHEMA = LOG[LOG_ACTIONS[0]].schema;

export const LogEntrySchema = z.discriminatedUnion("action", [
  FIRST_SCHEMA,
  ...new Set(
    LOG_ACTIONS.map((action) => LOG[action].schema).filter((schema) => schema !== FIRST_SCHEMA),
  ),
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
