import { z } from "zod";

import { WholeCount } from "./whole-count.ts";

export const EXPORT_SLICE_DEADLINE_MS = 600_000;

export const EXPORT_SLICE_BYTES = 8 * 1024 * 1024;

export const EXPORT_PAGE_ROWS = 2000;

export const EXPORT_SLICE_ITEMS = 40;

export const ITEM_FILES_STREAM = "item-files";

export const EXPORT_ENTRY_BYTES = 8 * 1024 * 1024;

export const EXPORT_KEEP_MS = 24 * 60 * 60 * 1000;

export const EXPORT_CLEANUP_BATCH = 5;

export const EXPORT_FAILURES = ["gave-up", "cancelled", "replaced", "list-changed"] as const;

export type ExportFailure = (typeof EXPORT_FAILURES)[number];

const PartialItemSchema = z
  .object({ id: z.number().int().positive(), entries: WholeCount })
  .readonly();

export type PartialItem = z.infer<typeof PartialItemSchema>;

export const ExportTallySchema = z
  .object({
    tables: z
      .record(z.string(), z.object({ files: WholeCount, rows: WholeCount }).readonly())
      .readonly(),
    openItems: WholeCount,
    generations: z.array(WholeCount).readonly(),
    list: z.string(),
    partial: PartialItemSchema.nullable().default(null),
  })
  .readonly();

export type ExportTally = z.infer<typeof ExportTallySchema>;

export function tallyOf({ tally }: Readonly<{ tally: string }>): ExportTally {
  return ExportTallySchema.parse(JSON.parse(tally));
}

export const NO_TALLY: ExportTally = {
  tables: {},
  openItems: 0,
  generations: [],
  list: "",
  partial: null,
};

const RunningExportSchema = z.object({
  state: z.literal("running"),
  id: z.number().int().positive(),
  createdAt: z.number().int(),
  entries: WholeCount,
  dataBytes: WholeCount,
  parts: WholeCount,
});

const ReadyExportSchema = z.object({
  state: z.literal("ready"),
  id: z.number().int().positive(),
  createdAt: z.number().int(),
  finishedAt: z.number().int(),
  entries: WholeCount,
  dataBytes: WholeCount,
  parts: WholeCount,
  zipBytes: WholeCount,
});

const FailedExportSchema = z.object({
  state: z.literal("failed"),
  id: z.number().int().positive(),
  createdAt: z.number().int(),
  failure: z.enum(EXPORT_FAILURES),
});

export const ExportStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  RunningExportSchema,
  ReadyExportSchema,
  FailedExportSchema,
]);

export type ExportStatus = z.infer<typeof ExportStatusSchema>;

export const StartedExportSchema = z.object({ id: z.number().int().positive() });
