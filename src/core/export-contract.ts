import { z } from "zod";

export const EXPORT_FORMAT = 1;

export const EXPORT_SLICE_ITEMS = 40;

export const EXPORT_SLICE_BYTES = 8 * 1024 * 1024;

export const EXPORT_ITEM_GROUP = 5;

export const EXPORT_PAGE_ROWS = 2000;

export const EXPORT_ENTRY_BYTES = 8 * 1024 * 1024;

export const EXPORT_KEEP_MS = 24 * 60 * 60 * 1000;

export const EXPORT_CLEANUP_BATCH = 5;

export const EXPORT_SETTLE_MS = 12 * 60 * 1000;

const WholeCount = z.number().int().nonnegative();

export const ExportTallySchema = z
  .object({
    tables: z
      .record(z.string(), z.object({ files: WholeCount, rows: WholeCount }).readonly())
      .readonly(),
    openItems: WholeCount,
  })
  .readonly();

export type ExportTally = z.infer<typeof ExportTallySchema>;

export const NO_TALLY: ExportTally = { tables: {}, openItems: 0 };

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
  failure: z.string(),
});

export const ExportStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  RunningExportSchema,
  ReadyExportSchema,
  FailedExportSchema,
]);

export type ExportStatus = z.infer<typeof ExportStatusSchema>;

export const StartedExportSchema = z.object({ id: z.number().int().positive() });

export const EXPORT_FAILURES = ["gave-up", "cancelled", "replaced"] as const;

export type ExportFailure = (typeof EXPORT_FAILURES)[number];

export function exportDay(createdAt: number): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function exportRootName(createdAt: number): string {
  return `threadsift-${exportDay(createdAt)}`;
}
